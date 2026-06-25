package http

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Ryota0312/stella-comp/apps/api/internal/service"
	"github.com/Ryota0312/stella-comp/apps/api/internal/usecase"
	"github.com/gin-gonic/gin"
)

const DefaultMaxMultipartMemory = 64 << 20

type UploadResponse struct {
	SessionID     string                    `json:"sessionId"`
	Uploaded      []service.UploadedPreview `json:"uploaded"`
	UploadedCount int                       `json:"uploadedCount"`
	UploadedBytes int64                     `json:"uploadedBytes"`
}

type RouterConfig struct {
	MaxMultipartMemory int64
	AllowedOrigins     []string
}

func NewRouter(storage service.PreviewStorage, jobs *usecase.PreviewJobs, config RouterConfig) *gin.Engine {
	if config.MaxMultipartMemory == 0 {
		config.MaxMultipartMemory = DefaultMaxMultipartMemory
	}

	router := gin.Default()
	router.MaxMultipartMemory = config.MaxMultipartMemory
	router.Use(corsForLocalDevelopment(config.AllowedOrigins))

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

		uploaded, uploadedBytes, err := storage.SavePreviews(sessionID, files)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save preview file"})
			return
		}

		c.JSON(http.StatusCreated, UploadResponse{
			SessionID:     sessionID,
			Uploaded:      uploaded,
			UploadedCount: len(uploaded),
			UploadedBytes: uploadedBytes,
		})
	})

	router.POST("/api/jobs", func(c *gin.Context) {
		var request usecase.CreateJobRequest
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "json body is required"})
			return
		}

		job, err := jobs.CreateCompositeJob(context.Background(), request)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusAccepted, job)
	})

	router.POST("/api/preview-alignments", func(c *gin.Context) {
		var request usecase.EstimateTransformsRequest
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "json body is required"})
			return
		}

		alignmentJob, err := jobs.CreateAlignmentJob(context.Background(), request)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusAccepted, alignmentJob)
	})

	router.GET("/api/preview-alignments/:alignmentJobID", func(c *gin.Context) {
		alignmentJob, ok := jobs.GetAlignmentJob(c.Param("alignmentJobID"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "preview alignment job not found"})
			return
		}

		c.JSON(http.StatusOK, alignmentJob)
	})

	router.GET("/api/jobs/:jobID", func(c *gin.Context) {
		job, ok := jobs.GetCompositeJob(c.Param("jobID"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
			return
		}

		c.JSON(http.StatusOK, job)
	})

	router.GET("/api/jobs/:jobID/result", func(c *gin.Context) {
		job, ok := jobs.GetCompositeJob(c.Param("jobID"))
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

func corsForLocalDevelopment(extraOrigins []string) gin.HandlerFunc {
	allowedOrigins := map[string]struct{}{
		"http://localhost:3000": {},
		"http://127.0.0.1:3000": {},
		"http://localhost:3001": {},
		"http://127.0.0.1:3001": {},
	}

	for _, origin := range extraOrigins {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			allowedOrigins[origin] = struct{}{}
		}
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
