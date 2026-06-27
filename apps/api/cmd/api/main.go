package main

import (
	"log"
	"os"
	"strings"
	"time"

	apiprocessor "github.com/Ryota0312/stella-comp/apps/api/internal/processor"
	"github.com/Ryota0312/stella-comp/apps/api/internal/service"
	apihttp "github.com/Ryota0312/stella-comp/apps/api/internal/transport/http"
	"github.com/Ryota0312/stella-comp/apps/api/internal/usecase"
	"github.com/gin-gonic/gin"
)

const (
	defaultAddress         = ":8080"
	defaultDataDir         = ".data"
	defaultWorkerAddress   = "[::1]:50051"
	defaultCleanupTTL      = 24 * time.Hour
	defaultCleanupInterval = time.Hour
)

func main() {
	dataDir := envOrDefault("STELLA_COMP_DATA_DIR", defaultDataDir)
	workerAddress := envOrDefault("STELLA_COMP_WORKER_ADDR", defaultWorkerAddress)
	router := newRouterWithProcessorAndCleanup(dataDir, apiprocessor.GRPC{Address: workerAddress})
	address := envOrDefault("STELLA_COMP_API_ADDR", defaultAddress)
	if err := router.Run(address); err != nil {
		panic(err)
	}
}

func newRouter(dataDir string) *gin.Engine {
	workerAddress := envOrDefault("STELLA_COMP_WORKER_ADDR", defaultWorkerAddress)
	return newRouterWithProcessor(dataDir, apiprocessor.GRPC{Address: workerAddress})
}

func newRouterWithProcessor(dataDir string, imageProcessor usecase.Processor) *gin.Engine {
	router, _ := buildRouter(dataDir, imageProcessor)
	return router
}

func newRouterWithProcessorAndCleanup(dataDir string, imageProcessor usecase.Processor) *gin.Engine {
	router, jobs := buildRouter(dataDir, imageProcessor)
	startCleanupWorker(jobs, envDurationOrDefault("STELLA_COMP_CLEANUP_TTL", defaultCleanupTTL), envDurationOrDefault("STELLA_COMP_CLEANUP_INTERVAL", defaultCleanupInterval))
	return router
}

func buildRouter(dataDir string, imageProcessor usecase.Processor) (*gin.Engine, *usecase.PreviewJobs) {
	storage, err := service.NewPreviewStorage(dataDir)
	if err != nil {
		panic(err)
	}

	jobs := usecase.NewPreviewJobs(storage.DataDir, storage, imageProcessor)
	return apihttp.NewRouter(storage, jobs, apihttp.RouterConfig{}), jobs
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func envDurationOrDefault(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	duration, err := time.ParseDuration(value)
	if err != nil {
		log.Printf("invalid %s=%q: %v; using %s", key, value, err, fallback)
		return fallback
	}

	return duration
}

func startCleanupWorker(jobs *usecase.PreviewJobs, ttl time.Duration, interval time.Duration) {
	if ttl <= 0 || interval <= 0 {
		log.Printf("preview cleanup disabled ttl=%s interval=%s", ttl, interval)
		return
	}

	go func() {
		runCleanup := func() {
			result, err := jobs.CleanupExpired(time.Now().UTC(), ttl)
			if err != nil {
				log.Printf("preview cleanup failed: %v", err)
				return
			}
			if result.DeletedPreviewSessions > 0 || result.DeletedCompositeJobs > 0 || result.DeletedAlignmentJobs > 0 {
				log.Printf(
					"preview cleanup removed sessions=%d compositeJobs=%d alignmentJobs=%d",
					result.DeletedPreviewSessions,
					result.DeletedCompositeJobs,
					result.DeletedAlignmentJobs,
				)
			}
		}

		runCleanup()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			runCleanup()
		}
	}()
}
