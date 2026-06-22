package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	stellacompv1 "github.com/Ryota0312/stella-comp/apps/api/internal/gen/stellacomp/v1"
	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const (
	defaultAddress            = ":8080"
	defaultDataDir            = ".data"
	defaultMaxMultipartMemory = 64 << 20
	defaultWorkerAddress      = "[::1]:50051"
)

type processor interface {
	AlignAndAverage(ctx context.Context, request *stellacompv1.AlignAndAverageRequest) (*stellacompv1.AlignAndAverageResponse, error)
}

type grpcProcessor struct {
	address string
}

func (processor grpcProcessor) AlignAndAverage(ctx context.Context, request *stellacompv1.AlignAndAverageRequest) (*stellacompv1.AlignAndAverageResponse, error) {
	connection, err := grpc.DialContext(ctx, processor.address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	defer connection.Close()

	client := stellacompv1.NewImageProcessorClient(connection)
	return client.AlignAndAverage(ctx, request)
}

type uploadResponse struct {
	SessionID     string            `json:"sessionId"`
	Uploaded      []uploadedPreview `json:"uploaded"`
	UploadedCount int               `json:"uploadedCount"`
	UploadedBytes int64             `json:"uploadedBytes"`
}

type uploadedPreview struct {
	FieldName string `json:"fieldName"`
	FileName  string `json:"fileName"`
	Path      string `json:"path"`
	Size      int64  `json:"size"`
}

type createJobRequest struct {
	SessionID      string   `json:"sessionId"`
	PreviewPaths   []string `json:"previewPaths"`
	BaseImageIndex int      `json:"baseImageIndex"`
}

type jobResponse struct {
	JobID          string              `json:"jobId"`
	Status         string              `json:"status"`
	SessionID      string              `json:"sessionId"`
	BaseImageIndex int                 `json:"baseImageIndex"`
	PreviewPaths   []string            `json:"previewPaths"`
	OutputPath     string              `json:"outputPath,omitempty"`
	Error          string              `json:"error,omitempty"`
	Warnings       []processingWarning `json:"warnings,omitempty"`
	CreatedAt      time.Time           `json:"createdAt"`
	UpdatedAt      time.Time           `json:"updatedAt"`
}

type processingWarning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type jobStore struct {
	mu   sync.RWMutex
	jobs map[string]*jobResponse
}

func main() {
	dataDir := envOrDefault("STELLA_COMP_DATA_DIR", defaultDataDir)
	workerAddress := envOrDefault("STELLA_COMP_WORKER_ADDR", defaultWorkerAddress)
	router := newRouterWithProcessor(dataDir, grpcProcessor{address: workerAddress})
	address := envOrDefault("STELLA_COMP_API_ADDR", defaultAddress)
	if err := router.Run(address); err != nil {
		panic(err)
	}
}

func newRouter(dataDir string) *gin.Engine {
	workerAddress := envOrDefault("STELLA_COMP_WORKER_ADDR", defaultWorkerAddress)
	return newRouterWithProcessor(dataDir, grpcProcessor{address: workerAddress})
}

func newRouterWithProcessor(dataDir string, imageProcessor processor) *gin.Engine {
	router := gin.Default()
	router.MaxMultipartMemory = defaultMaxMultipartMemory
	router.Use(corsForLocalDevelopment())
	jobs := &jobStore{jobs: map[string]*jobResponse{}}

	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	router.POST("/api/preview-uploads", func(c *gin.Context) {
		sessionID := strings.TrimSpace(c.PostForm("sessionId"))
		if sessionID == "" {
			sessionID = fmt.Sprintf("%d", time.Now().UnixNano())
		}

		form, err := c.MultipartForm()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "multipart form is required"})
			return
		}

		files := form.File["previews"]
		if len(files) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "at least one preview file is required"})
			return
		}

		sessionDir := filepath.Join(dataDir, "uploads", "previews", safePathSegment(sessionID))
		if err := os.MkdirAll(sessionDir, 0o755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create upload directory"})
			return
		}

		response := uploadResponse{
			SessionID: sessionID,
			Uploaded:  make([]uploadedPreview, 0, len(files)),
		}

		for index, fileHeader := range files {
			fileName := indexedFileName(index, safeFileName(fileHeader.Filename))
			if fileName == "" {
				fileName = fmt.Sprintf("preview-%04d.jpg", index+1)
			}

			destination := filepath.Join(sessionDir, fileName)
			size, err := saveMultipartFile(fileHeader, destination)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save preview file"})
				return
			}

			response.Uploaded = append(response.Uploaded, uploadedPreview{
				FieldName: "previews",
				FileName:  fileName,
				Path:      destination,
				Size:      size,
			})
			response.UploadedBytes += size
		}

		response.UploadedCount = len(response.Uploaded)
		c.JSON(http.StatusCreated, response)
	})

	router.POST("/api/jobs", func(c *gin.Context) {
		var request createJobRequest
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "json body is required"})
			return
		}

		if strings.TrimSpace(request.SessionID) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "sessionId is required"})
			return
		}
		sessionID := safePathSegment(request.SessionID)

		previewPaths := request.PreviewPaths
		if len(previewPaths) == 0 {
			var err error
			previewPaths, err = previewPathsForSession(dataDir, sessionID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		}

		previewPaths, err := validatePreviewPaths(dataDir, sessionID, previewPaths)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if len(previewPaths) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "at least one preview path is required"})
			return
		}
		if request.BaseImageIndex < 0 || request.BaseImageIndex >= len(previewPaths) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "baseImageIndex is out of range"})
			return
		}

		jobID := newID()
		outputPath := filepath.Join(dataDir, "jobs", jobID, "result.jpg")
		now := time.Now().UTC()
		job := &jobResponse{
			JobID:          jobID,
			Status:         "queued",
			SessionID:      sessionID,
			BaseImageIndex: request.BaseImageIndex,
			PreviewPaths:   previewPaths,
			OutputPath:     outputPath,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		jobs.put(job)

		go runJob(context.Background(), jobs, jobID, imageProcessor, previewPaths, outputPath, request.BaseImageIndex)

		c.JSON(http.StatusAccepted, job)
	})

	router.GET("/api/jobs/:jobID", func(c *gin.Context) {
		job, ok := jobs.get(c.Param("jobID"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
			return
		}

		c.JSON(http.StatusOK, job)
	})

	router.GET("/api/jobs/:jobID/result", func(c *gin.Context) {
		job, ok := jobs.get(c.Param("jobID"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
			return
		}
		if job.Status != "completed" {
			c.JSON(http.StatusConflict, gin.H{"error": "job is not completed"})
			return
		}

		c.File(job.OutputPath)
	})

	return router
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func saveMultipartFile(fileHeader *multipart.FileHeader, destination string) (int64, error) {
	source, err := fileHeader.Open()
	if err != nil {
		return 0, err
	}
	defer source.Close()

	target, err := os.Create(destination)
	if err != nil {
		return 0, err
	}
	defer target.Close()

	return io.Copy(target, source)
}

func previewPathsForSession(dataDir string, sessionID string) ([]string, error) {
	sessionDir := filepath.Join(dataDir, "uploads", "previews", sessionID)
	entries, err := os.ReadDir(sessionDir)
	if err != nil {
		return nil, fmt.Errorf("preview upload session not found")
	}

	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		paths = append(paths, filepath.Join(sessionDir, entry.Name()))
	}
	sort.Strings(paths)

	return paths, nil
}

func validatePreviewPaths(dataDir string, sessionID string, paths []string) ([]string, error) {
	sessionDir, err := filepath.Abs(filepath.Join(dataDir, "uploads", "previews", sessionID))
	if err != nil {
		return nil, err
	}

	validated := make([]string, 0, len(paths))
	for _, path := range paths {
		if strings.TrimSpace(path) == "" {
			continue
		}

		absolutePath, err := filepath.Abs(path)
		if err != nil {
			return nil, err
		}
		relative, err := filepath.Rel(sessionDir, absolutePath)
		if err != nil {
			return nil, err
		}
		if strings.HasPrefix(relative, ".."+string(filepath.Separator)) || relative == ".." || filepath.IsAbs(relative) {
			return nil, fmt.Errorf("preview path must be inside the upload session")
		}
		if _, err := os.Stat(absolutePath); err != nil {
			return nil, fmt.Errorf("preview path does not exist")
		}

		validated = append(validated, absolutePath)
	}

	return validated, nil
}

func runJob(ctx context.Context, jobs *jobStore, jobID string, imageProcessor processor, previewPaths []string, outputPath string, baseImageIndex int) {
	jobs.update(jobID, func(job *jobResponse) {
		job.Status = "running"
		job.UpdatedAt = time.Now().UTC()
	})

	images := make([]*stellacompv1.InputImage, 0, len(previewPaths))
	for _, previewPath := range previewPaths {
		images = append(images, &stellacompv1.InputImage{
			SourcePath:  previewPath,
			PreviewPath: previewPath,
		})
	}

	response, err := imageProcessor.AlignAndAverage(ctx, &stellacompv1.AlignAndAverageRequest{
		Images:         images,
		OutputPath:     outputPath,
		BaseImageIndex: int32(baseImageIndex),
	})
	if err != nil {
		jobs.update(jobID, func(job *jobResponse) {
			job.Status = "failed"
			job.Error = err.Error()
			job.UpdatedAt = time.Now().UTC()
		})
		return
	}

	warnings := make([]processingWarning, 0, len(response.GetWarnings()))
	for _, warning := range response.GetWarnings() {
		warnings = append(warnings, processingWarning{
			Code:    warning.GetCode(),
			Message: warning.GetMessage(),
		})
	}

	jobs.update(jobID, func(job *jobResponse) {
		job.Status = "completed"
		job.OutputPath = response.GetOutputPath()
		job.Warnings = warnings
		job.UpdatedAt = time.Now().UTC()
	})
}

func (store *jobStore) put(job *jobResponse) {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.jobs[job.JobID] = cloneJob(job)
}

func (store *jobStore) get(jobID string) (*jobResponse, bool) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	job, ok := store.jobs[jobID]
	if !ok {
		return nil, false
	}

	return cloneJob(job), true
}

func (store *jobStore) update(jobID string, update func(job *jobResponse)) {
	store.mu.Lock()
	defer store.mu.Unlock()
	job, ok := store.jobs[jobID]
	if !ok {
		return
	}

	update(job)
}

func cloneJob(job *jobResponse) *jobResponse {
	cloned := *job
	cloned.PreviewPaths = append([]string(nil), job.PreviewPaths...)
	cloned.Warnings = append([]processingWarning(nil), job.Warnings...)
	return &cloned
}

func newID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}

	return hex.EncodeToString(bytes[:])
}

func safeFileName(fileName string) string {
	base := filepath.Base(strings.TrimSpace(fileName))
	base = strings.ReplaceAll(base, string(filepath.Separator), "_")
	base = strings.ReplaceAll(base, "/", "_")
	base = strings.ReplaceAll(base, "\\", "_")

	if base == "." || base == string(filepath.Separator) {
		return ""
	}

	return base
}

func safePathSegment(value string) string {
	var builder strings.Builder
	for _, char := range value {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char)
		case char >= 'A' && char <= 'Z':
			builder.WriteRune(char)
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
		case char == '-' || char == '_':
			builder.WriteRune(char)
		}
	}

	result := builder.String()
	if result == "" {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}

	return result
}

func indexedFileName(index int, fileName string) string {
	if fileName == "" {
		return ""
	}

	extension := filepath.Ext(fileName)
	stem := strings.TrimSuffix(fileName, extension)
	if stem == "" {
		stem = "preview"
	}

	return fmt.Sprintf("%04d-%s%s", index+1, stem, extension)
}

func corsForLocalDevelopment() gin.HandlerFunc {
	allowedOrigins := map[string]struct{}{
		"http://localhost:3000": {},
		"http://127.0.0.1:3000": {},
		"http://localhost:3001": {},
		"http://127.0.0.1:3001": {},
	}

	for _, origin := range strings.Split(os.Getenv("STELLA_COMP_ALLOWED_ORIGINS"), ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			allowedOrigins[origin] = struct{}{}
		}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if _, ok := allowedOrigins[origin]; ok {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
