package main

import (
	"os"
	"strings"

	apiprocessor "github.com/Ryota0312/stella-comp/apps/api/internal/processor"
	"github.com/Ryota0312/stella-comp/apps/api/internal/service"
	apihttp "github.com/Ryota0312/stella-comp/apps/api/internal/transport/http"
	"github.com/Ryota0312/stella-comp/apps/api/internal/usecase"
	"github.com/gin-gonic/gin"
)

const (
	defaultAddress       = ":8080"
	defaultDataDir       = ".data"
	defaultWorkerAddress = "[::1]:50051"
)

func main() {
	dataDir := envOrDefault("STELLA_COMP_DATA_DIR", defaultDataDir)
	workerAddress := envOrDefault("STELLA_COMP_WORKER_ADDR", defaultWorkerAddress)
	router := newRouterWithProcessor(dataDir, apiprocessor.GRPC{Address: workerAddress})
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
	storage, err := service.NewPreviewStorage(dataDir)
	if err != nil {
		panic(err)
	}

	jobs := usecase.NewPreviewJobs(storage.DataDir, storage, imageProcessor)
	return apihttp.NewRouter(storage, jobs, apihttp.RouterConfig{})
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}
