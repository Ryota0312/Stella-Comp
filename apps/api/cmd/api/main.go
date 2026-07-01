package main

import (
	"context"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	apiprocessor "github.com/Ryota0312/stella-comp/apps/api/internal/processor"
	"github.com/Ryota0312/stella-comp/apps/api/internal/service"
	apihttp "github.com/Ryota0312/stella-comp/apps/api/internal/transport/http"
	"github.com/Ryota0312/stella-comp/apps/api/internal/usecase"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

const (
	defaultAddress         = ":8080"
	defaultDataDir         = ".data"
	defaultWorkerAddress   = "[::1]:50051"
	defaultCleanupTTL      = 24 * time.Hour
	defaultCleanupInterval = time.Hour
	defaultQueueConnectTTL = 30 * time.Second
	defaultJobConcurrency  = 1
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

	jobs := newPreviewJobs(storage.DataDir, storage, imageProcessor)
	jobs.StartWorkers(
		context.Background(),
		envIntOrDefault("STELLA_COMP_COMPOSITE_CONCURRENCY", defaultJobConcurrency),
		envIntOrDefault("STELLA_COMP_ALIGNMENT_CONCURRENCY", defaultJobConcurrency),
	)
	return apihttp.NewRouter(storage, jobs, apihttp.RouterConfig{}), jobs
}

func newPreviewJobs(dataDir string, storage service.PreviewStorage, imageProcessor usecase.Processor) *usecase.PreviewJobs {
	queueURL := strings.TrimSpace(os.Getenv("STELLA_COMP_QUEUE_URL"))
	if queueURL == "" {
		return usecase.NewPreviewJobs(dataDir, storage, imageProcessor)
	}

	client, err := usecase.NewRedisClientFromURL(queueURL)
	if err != nil {
		panic(err)
	}
	consumerName := envOrDefault("STELLA_COMP_QUEUE_CONSUMER", hostnameOrDefault("api"))
	return usecase.NewPreviewJobsWithRedis(dataDir, storage, imageProcessor, waitForRedisBackend(client, consumerName))
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

func envIntOrDefault(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		log.Printf("invalid %s=%q: %v; using %d", key, value, err, fallback)
		return fallback
	}
	return parsed
}

func hostnameOrDefault(fallback string) string {
	hostname, err := os.Hostname()
	if err != nil || strings.TrimSpace(hostname) == "" {
		return fallback
	}
	return hostname
}

func waitForRedisBackend(client redis.UniversalClient, consumerName string) *usecase.RedisBackend {
	timeout := envDurationOrDefault("STELLA_COMP_QUEUE_CONNECT_TIMEOUT", defaultQueueConnectTTL)
	deadline := time.Now().Add(timeout)
	for {
		backend, err := usecase.NewRedisBackend(context.Background(), client, consumerName)
		if err == nil {
			return backend
		}
		if timeout <= 0 || time.Now().After(deadline) {
			panic(err)
		}
		log.Printf("waiting for Valkey queue backend: %v", err)
		time.Sleep(time.Second)
	}
}

func startCleanupWorker(jobs *usecase.PreviewJobs, ttl time.Duration, interval time.Duration) {
	if ttl <= 0 || interval <= 0 {
		log.Printf("preview cleanup disabled ttl=%s interval=%s", ttl, interval)
		return
	}

	go func() {
		runCleanup := func() {
			locked, err := jobs.CleanupLocker.WithCleanupLock(context.Background(), func() error {
				result, err := jobs.CleanupExpired(time.Now().UTC(), ttl)
				if err != nil {
					return err
				}
				if result.DeletedPreviewSessions > 0 || result.DeletedCompositeJobs > 0 || result.DeletedAlignmentJobs > 0 {
					log.Printf(
						"preview cleanup removed sessions=%d compositeJobs=%d alignmentJobs=%d",
						result.DeletedPreviewSessions,
						result.DeletedCompositeJobs,
						result.DeletedAlignmentJobs,
					)
				}
				return nil
			})
			if err != nil {
				log.Printf("preview cleanup failed: %v", err)
				return
			}
			if !locked {
				log.Printf("preview cleanup skipped because another worker holds the lock")
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
