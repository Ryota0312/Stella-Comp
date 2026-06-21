package main

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	defaultAddress            = ":8080"
	defaultDataDir            = ".data"
	defaultMaxMultipartMemory = 64 << 20
)

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

func main() {
	dataDir := envOrDefault("STELLA_COMP_DATA_DIR", defaultDataDir)
	router := newRouter(dataDir)
	address := envOrDefault("STELLA_COMP_API_ADDR", defaultAddress)
	if err := router.Run(address); err != nil {
		panic(err)
	}
}

func newRouter(dataDir string) *gin.Engine {
	router := gin.Default()
	router.MaxMultipartMemory = defaultMaxMultipartMemory
	router.Use(corsForLocalDevelopment())

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
