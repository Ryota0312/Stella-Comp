package usecase

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	stellacompv1 "github.com/Ryota0312/stella-comp/apps/api/internal/gen/stellacomp/v1"
	"github.com/Ryota0312/stella-comp/apps/api/internal/service"
)

type PreviewJobs struct {
	DataDir       string
	Storage       service.PreviewStorage
	Processor     Processor
	Jobs          CompositeJobStateStore
	AlignmentJobs AlignmentJobStateStore
	Queue         JobQueue
	CleanupLocker CleanupLocker
	NewID         IDGenerator
}

type CleanupResult struct {
	DeletedPreviewSessions int
	DeletedCompositeJobs   int
	DeletedAlignmentJobs   int
}

func NewPreviewJobs(dataDir string, storage service.PreviewStorage, processor Processor) *PreviewJobs {
	queue := NewMemoryJobQueue()
	return &PreviewJobs{
		DataDir:       dataDir,
		Storage:       storage,
		Processor:     processor,
		Jobs:          NewJobStore(),
		AlignmentJobs: NewAlignmentJobStore(),
		Queue:         queue,
		CleanupLocker: &LocalCleanupLocker{},
		NewID:         NewID,
	}
}

func NewPreviewJobsWithRedis(dataDir string, storage service.PreviewStorage, processor Processor, backend *RedisBackend) *PreviewJobs {
	return &PreviewJobs{
		DataDir:       dataDir,
		Storage:       storage,
		Processor:     processor,
		Jobs:          backend,
		AlignmentJobs: RedisAlignmentJobStore{backend: backend},
		Queue:         backend,
		CleanupLocker: backend,
		NewID:         NewID,
	}
}

func (usecase *PreviewJobs) CreateCompositeJob(ctx context.Context, request CreateJobRequest) (*JobResponse, error) {
	sessionID, previewPaths, err := usecase.validatePreviewJobRequest(request.SessionID, request.PreviewPaths, request.BaseImageIndex)
	if err != nil {
		return nil, err
	}

	jobID := usecase.NewID()
	outputPath := filepath.Join(usecase.DataDir, "jobs", jobID, "result.jpg")
	now := time.Now().UTC()
	job := &JobResponse{
		JobID:          jobID,
		Status:         "queued",
		SessionID:      sessionID,
		BaseImageIndex: request.BaseImageIndex,
		PreviewPaths:   previewPaths,
		OutputPath:     outputPath,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := usecase.Jobs.Put(job); err != nil {
		return nil, err
	}

	if err := usecase.Queue.EnqueueComposite(ctx, jobID); err != nil {
		_ = usecase.Jobs.Delete(jobID)
		return nil, err
	}

	return job, nil
}

func (usecase *PreviewJobs) CleanupExpired(now time.Time, ttl time.Duration) (CleanupResult, error) {
	if ttl <= 0 {
		return CleanupResult{}, nil
	}

	cutoff := now.Add(-ttl)
	result := CleanupResult{}
	protectedSessions := map[string]struct{}{}

	for _, job := range usecase.Jobs.List() {
		if !isTerminalStatus(job.Status) {
			protectedSessions[job.SessionID] = struct{}{}
			continue
		}
		if job.UpdatedAt.After(cutoff) {
			protectedSessions[job.SessionID] = struct{}{}
			continue
		}
		if job.OutputPath != "" {
			if err := usecase.deleteCompositeJobFiles(job.OutputPath); err != nil {
				return result, err
			}
		}
		if err := usecase.Jobs.Delete(job.JobID); err != nil {
			return result, err
		}
		result.DeletedCompositeJobs++
	}

	for _, job := range usecase.AlignmentJobs.List() {
		if !isTerminalStatus(job.Status) {
			protectedSessions[job.SessionID] = struct{}{}
			continue
		}
		if job.UpdatedAt.After(cutoff) {
			protectedSessions[job.SessionID] = struct{}{}
			continue
		}
		if err := usecase.AlignmentJobs.Delete(job.AlignmentJobID); err != nil {
			return result, err
		}
		result.DeletedAlignmentJobs++
	}

	sessions, err := usecase.Storage.ListSessions()
	if err != nil {
		return result, err
	}
	for _, session := range sessions {
		if _, ok := protectedSessions[session.SessionID]; ok {
			continue
		}
		if session.ModTime.After(cutoff) {
			continue
		}
		if err := usecase.Storage.DeleteSession(session.SessionID); err != nil {
			return result, err
		}
		result.DeletedPreviewSessions++
	}

	return result, nil
}

func (usecase *PreviewJobs) CreateAlignmentJob(ctx context.Context, request EstimateTransformsRequest) (*AlignmentJobResponse, error) {
	sessionID, previewPaths, err := usecase.validatePreviewJobRequest(request.SessionID, request.PreviewPaths, request.BaseImageIndex)
	if err != nil {
		return nil, err
	}
	alignmentMethod := NormalizeAlignmentMethod(request.AlignmentMethod)
	transformModel := NormalizeTransformModel(request.TransformModel)

	alignmentJobID := usecase.NewID()
	now := time.Now().UTC()
	alignmentJob := &AlignmentJobResponse{
		AlignmentJobID:  alignmentJobID,
		Status:          "queued",
		SessionID:       sessionID,
		BaseImageIndex:  request.BaseImageIndex,
		AlignmentMethod: alignmentMethod,
		TransformModel:  transformModel,
		PreviewPaths:    previewPaths,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := usecase.AlignmentJobs.Put(alignmentJob); err != nil {
		return nil, err
	}

	if err := usecase.Queue.EnqueueAlignment(ctx, alignmentJobID); err != nil {
		_ = usecase.AlignmentJobs.Delete(alignmentJobID)
		return nil, err
	}

	return alignmentJob, nil
}

func (usecase *PreviewJobs) StartWorkers(ctx context.Context, compositeConcurrency int, alignmentConcurrency int) {
	if compositeConcurrency < 0 {
		compositeConcurrency = 0
	}
	if alignmentConcurrency < 0 {
		alignmentConcurrency = 0
	}

	for index := 0; index < compositeConcurrency; index++ {
		go usecase.runCompositeWorker(ctx)
	}
	for index := 0; index < alignmentConcurrency; index++ {
		go usecase.runAlignmentWorker(ctx)
	}
}

func (usecase *PreviewJobs) runCompositeWorker(ctx context.Context) {
	for {
		queuedJob, err := usecase.Queue.ClaimComposite(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return
			}
			if !errors.Is(err, ErrNoQueuedJob) {
				log.Printf("claim composite job failed: %v", err)
			}
			continue
		}

		job, ok := usecase.Jobs.Get(queuedJob.ID)
		if ok {
			usecase.runJob(ctx, job.JobID, job.PreviewPaths, job.OutputPath, job.BaseImageIndex)
		}
		if err := queuedJob.Ack(ctx); err != nil {
			log.Printf("ack composite job %s failed: %v", queuedJob.ID, err)
		}
	}
}

func (usecase *PreviewJobs) runAlignmentWorker(ctx context.Context) {
	for {
		queuedJob, err := usecase.Queue.ClaimAlignment(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return
			}
			if !errors.Is(err, ErrNoQueuedJob) {
				log.Printf("claim alignment job failed: %v", err)
			}
			continue
		}

		job, ok := usecase.AlignmentJobs.Get(queuedJob.ID)
		if ok {
			usecase.runAlignmentJob(
				ctx,
				job.AlignmentJobID,
				PreviewInputImages(job.PreviewPaths),
				job.BaseImageIndex,
				job.AlignmentMethod,
				job.TransformModel,
			)
		}
		if err := queuedJob.Ack(ctx); err != nil {
			log.Printf("ack alignment job %s failed: %v", queuedJob.ID, err)
		}
	}
}

func (usecase *PreviewJobs) deleteCompositeJobFiles(outputPath string) error {
	jobDir := filepath.Dir(outputPath)
	dataDir, err := filepath.Abs(usecase.DataDir)
	if err != nil {
		return err
	}
	absoluteJobDir, err := filepath.Abs(jobDir)
	if err != nil {
		return err
	}
	relative, err := filepath.Rel(filepath.Join(dataDir, "jobs"), absoluteJobDir)
	if err != nil {
		return err
	}
	if relative == "." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || relative == ".." || filepath.IsAbs(relative) {
		return fmt.Errorf("job output path must be inside jobs directory")
	}
	err = os.RemoveAll(absoluteJobDir)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (usecase *PreviewJobs) GetCompositeJob(jobID string) (*JobResponse, bool) {
	return usecase.Jobs.Get(jobID)
}

func (usecase *PreviewJobs) GetAlignmentJob(jobID string) (*AlignmentJobResponse, bool) {
	return usecase.AlignmentJobs.Get(jobID)
}

func (usecase *PreviewJobs) validatePreviewJobRequest(rawSessionID string, rawPreviewPaths []string, baseImageIndex int) (string, []string, error) {
	if strings.TrimSpace(rawSessionID) == "" {
		return "", nil, fmt.Errorf("sessionId is required")
	}
	sessionID := service.SafePathSegment(rawSessionID)

	previewPaths := rawPreviewPaths
	if len(previewPaths) == 0 {
		var err error
		previewPaths, err = usecase.Storage.PathsForSession(sessionID)
		if err != nil {
			return "", nil, err
		}
	}

	previewPaths, err := usecase.Storage.ValidatePaths(sessionID, previewPaths)
	if err != nil {
		return "", nil, err
	}
	if len(previewPaths) == 0 {
		return "", nil, fmt.Errorf("at least one preview path is required")
	}
	if baseImageIndex < 0 || baseImageIndex >= len(previewPaths) {
		return "", nil, fmt.Errorf("baseImageIndex is out of range")
	}

	return sessionID, previewPaths, nil
}

func isTerminalStatus(status string) bool {
	return status == "completed" || status == "failed"
}

func (usecase *PreviewJobs) runJob(ctx context.Context, jobID string, previewPaths []string, outputPath string, baseImageIndex int) {
	if err := usecase.Jobs.Update(jobID, func(job *JobResponse) {
		job.Status = "running"
		job.UpdatedAt = time.Now().UTC()
	}); err != nil {
		log.Printf("update composite job %s failed: %v", jobID, err)
		return
	}

	response, err := usecase.Processor.AlignAndAverage(ctx, &stellacompv1.AlignAndAverageRequest{
		Images:         PreviewInputImages(previewPaths),
		OutputPath:     outputPath,
		BaseImageIndex: int32(baseImageIndex),
	})
	if err != nil {
		processorErr := err
		if err := usecase.Jobs.Update(jobID, func(job *JobResponse) {
			job.Status = "failed"
			job.Error = processorErr.Error()
			job.UpdatedAt = time.Now().UTC()
		}); err != nil {
			log.Printf("update failed composite job %s failed: %v", jobID, err)
		}
		return
	}

	if err := usecase.Jobs.Update(jobID, func(job *JobResponse) {
		job.Status = "completed"
		job.OutputPath = response.GetOutputPath()
		job.Warnings = ProcessingWarningsFromProto(response.GetWarnings())
		job.UpdatedAt = time.Now().UTC()
	}); err != nil {
		log.Printf("update completed composite job %s failed: %v", jobID, err)
	}
}

func (usecase *PreviewJobs) runAlignmentJob(ctx context.Context, jobID string, images []*stellacompv1.InputImage, baseImageIndex int, alignmentMethod string, transformModel string) {
	if err := usecase.AlignmentJobs.Update(jobID, func(job *AlignmentJobResponse) {
		job.Status = "running"
		job.UpdatedAt = time.Now().UTC()
	}); err != nil {
		log.Printf("update alignment job %s failed: %v", jobID, err)
		return
	}

	response, err := usecase.Processor.EstimateTransforms(ctx, &stellacompv1.EstimateTransformsRequest{
		Images:          images,
		BaseImageIndex:  int32(baseImageIndex),
		AlignmentMethod: alignmentMethod,
		TransformModel:  transformModel,
	})
	if err != nil {
		processorErr := err
		if err := usecase.AlignmentJobs.Update(jobID, func(job *AlignmentJobResponse) {
			job.Status = "failed"
			job.Error = processorErr.Error()
			job.UpdatedAt = time.Now().UTC()
		}); err != nil {
			log.Printf("update failed alignment job %s failed: %v", jobID, err)
		}
		return
	}

	if err := usecase.AlignmentJobs.Update(jobID, func(job *AlignmentJobResponse) {
		job.Status = "completed"
		job.Transforms = ImageTransformsFromProto(response.GetTransforms())
		job.Warnings = ProcessingWarningsFromProto(response.GetWarnings())
		job.UpdatedAt = time.Now().UTC()
	}); err != nil {
		log.Printf("update completed alignment job %s failed: %v", jobID, err)
	}
}

func NormalizeAlignmentMethod(rawMethod string) string {
	switch strings.TrimSpace(rawMethod) {
	case "stars":
		return "stars"
	default:
		return "akaze"
	}
}

func NormalizeTransformModel(rawModel string) string {
	switch strings.TrimSpace(rawModel) {
	case "affine":
		return "affine"
	default:
		return "homography"
	}
}

func ImageTransformsFromProto(protoTransforms []*stellacompv1.ImageTransform) []ImageTransform {
	transforms := make([]ImageTransform, 0, len(protoTransforms))
	for _, transform := range protoTransforms {
		transforms = append(transforms, ImageTransform{
			ImageIndex:     transform.GetImageIndex(),
			Affine:         append([]float64(nil), transform.GetAffine()...),
			Homography:     append([]float64(nil), transform.GetHomography()...),
			TransformModel: NormalizeTransformModel(transform.GetTransformModel()),
			Estimated:      transform.GetEstimated(),
		})
	}

	return transforms
}

func ProcessingWarningsFromProto(protoWarnings []*stellacompv1.ProcessingWarning) []ProcessingWarning {
	warnings := make([]ProcessingWarning, 0, len(protoWarnings))
	for _, warning := range protoWarnings {
		warnings = append(warnings, ProcessingWarning{
			Code:    warning.GetCode(),
			Message: warning.GetMessage(),
		})
	}

	return warnings
}

func PreviewInputImages(previewPaths []string) []*stellacompv1.InputImage {
	images := make([]*stellacompv1.InputImage, 0, len(previewPaths))
	for _, previewPath := range previewPaths {
		images = append(images, &stellacompv1.InputImage{
			SourcePath:  previewPath,
			PreviewPath: previewPath,
		})
	}

	return images
}
