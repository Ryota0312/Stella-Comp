package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	stellacompv1 "github.com/Ryota0312/stella-comp/apps/api/internal/gen/stellacomp/v1"
	"github.com/Ryota0312/stella-comp/apps/api/internal/service"
	apihttp "github.com/Ryota0312/stella-comp/apps/api/internal/transport/http"
	"github.com/Ryota0312/stella-comp/apps/api/internal/usecase"
	"github.com/gin-gonic/gin"
)

type fakeProcessor struct {
	request          *stellacompv1.AlignAndAverageRequest
	transformRequest *stellacompv1.EstimateTransformsRequest
	err              error
}

func (processor *fakeProcessor) AlignAndAverage(ctx context.Context, request *stellacompv1.AlignAndAverageRequest) (*stellacompv1.AlignAndAverageResponse, error) {
	processor.request = request
	if processor.err != nil {
		return nil, processor.err
	}
	if err := os.MkdirAll(filepath.Dir(request.GetOutputPath()), 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(request.GetOutputPath(), []byte("result"), 0o644); err != nil {
		return nil, err
	}

	return &stellacompv1.AlignAndAverageResponse{
		OutputPath: request.GetOutputPath(),
		Warnings: []*stellacompv1.ProcessingWarning{
			{Code: "TEST_WARNING", Message: "test warning"},
		},
	}, nil
}

func (processor *fakeProcessor) EstimateTransforms(ctx context.Context, request *stellacompv1.EstimateTransformsRequest) (*stellacompv1.EstimateTransformsResponse, error) {
	processor.transformRequest = request
	if processor.err != nil {
		return nil, processor.err
	}

	transforms := make([]*stellacompv1.ImageTransform, 0, len(request.GetImages()))
	for index := range request.GetImages() {
		transforms = append(transforms, &stellacompv1.ImageTransform{
			ImageIndex:     uint32(index),
			Affine:         []float64{1, 0, float64(index), 0, 1, 0},
			Homography:     []float64{1, 0, float64(index), 0, 1, 0, 0, 0, 1},
			TransformModel: request.GetTransformModel(),
			Estimated:      true,
		})
	}

	return &stellacompv1.EstimateTransformsResponse{
		Transforms: transforms,
		Warnings: []*stellacompv1.ProcessingWarning{
			{Code: "TEST_TRANSFORM_WARNING", Message: "test transform warning"},
		},
	}, nil
}

func TestPreviewUploadSavesFiles(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dataDir := t.TempDir()
	router := newRouter(dataDir)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("sessionId", "session-1"); err != nil {
		t.Fatal(err)
	}
	for _, content := range []string{"first", "second"} {
		part, err := writer.CreateFormFile("previews", "frame.jpg")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/preview-uploads", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	var upload apihttp.UploadResponse
	if err := json.Unmarshal(response.Body.Bytes(), &upload); err != nil {
		t.Fatal(err)
	}
	if upload.SessionID != "session-1" {
		t.Fatalf("session id = %q", upload.SessionID)
	}
	if upload.UploadedCount != 2 {
		t.Fatalf("uploaded count = %d", upload.UploadedCount)
	}

	wantFiles := []string{"0001-frame.jpg", "0002-frame.jpg"}
	for index, wantFile := range wantFiles {
		if upload.Uploaded[index].FileName != wantFile {
			t.Fatalf("uploaded[%d].fileName = %q", index, upload.Uploaded[index].FileName)
		}
		path := filepath.Join(dataDir, "uploads", "previews", "session-1", wantFile)
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected upload file %s: %v", path, err)
		}
	}
}

func TestPreviewUploadRequiresFiles(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newRouter(t.TempDir())

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("sessionId", "empty"); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/preview-uploads", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestCreateJobProcessesUploadedPreviewSession(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dataDir := t.TempDir()
	sessionDir := filepath.Join(dataDir, "uploads", "previews", "session-1")
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"0002-frame.jpg", "0001-frame.jpg"} {
		if err := os.WriteFile(filepath.Join(sessionDir, name), []byte("preview"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	processor := &fakeProcessor{}
	router := newRouterWithProcessor(dataDir, processor)

	request := httptest.NewRequest(http.MethodPost, "/api/jobs", strings.NewReader(`{"sessionId":"session-1","baseImageIndex":1}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	var created usecase.JobResponse
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.JobID == "" {
		t.Fatal("expected job id")
	}

	job := waitForJobStatus(t, router, created.JobID, "completed")
	if job.BaseImageIndex != 1 {
		t.Fatalf("base image index = %d", job.BaseImageIndex)
	}
	if len(processor.request.GetImages()) != 2 {
		t.Fatalf("worker images = %d", len(processor.request.GetImages()))
	}
	if !strings.HasSuffix(processor.request.GetImages()[0].GetPreviewPath(), "0001-frame.jpg") {
		t.Fatalf("first preview path = %q", processor.request.GetImages()[0].GetPreviewPath())
	}
	if len(job.Warnings) != 1 || job.Warnings[0].Code != "TEST_WARNING" {
		t.Fatalf("warnings = %#v", job.Warnings)
	}

	resultRequest := httptest.NewRequest(http.MethodGet, "/api/jobs/"+created.JobID+"/result", nil)
	resultResponse := httptest.NewRecorder()
	router.ServeHTTP(resultResponse, resultRequest)

	if resultResponse.Code != http.StatusOK {
		t.Fatalf("result status = %d, body = %s", resultResponse.Code, resultResponse.Body.String())
	}
	if resultResponse.Body.String() != "result" {
		t.Fatalf("result body = %q", resultResponse.Body.String())
	}
}

func TestCreateJobMarksWorkerErrorAsFailed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dataDir := t.TempDir()
	sessionDir := filepath.Join(dataDir, "uploads", "previews", "session-1")
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sessionDir, "0001-frame.jpg"), []byte("preview"), 0o644); err != nil {
		t.Fatal(err)
	}

	router := newRouterWithProcessor(dataDir, &fakeProcessor{err: errors.New("worker unavailable")})

	request := httptest.NewRequest(http.MethodPost, "/api/jobs", strings.NewReader(`{"sessionId":"session-1"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	var created usecase.JobResponse
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}

	job := waitForJobStatus(t, router, created.JobID, "failed")
	if !strings.Contains(job.Error, "worker unavailable") {
		t.Fatalf("job error = %q", job.Error)
	}
}

func TestPreviewAlignmentsReturnsTransforms(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dataDir := t.TempDir()
	sessionDir := filepath.Join(dataDir, "uploads", "previews", "session-1")
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"0002-frame.jpg", "0001-frame.jpg"} {
		if err := os.WriteFile(filepath.Join(sessionDir, name), []byte("preview"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	processor := &fakeProcessor{}
	router := newRouterWithProcessor(dataDir, processor)

	request := httptest.NewRequest(http.MethodPost, "/api/preview-alignments", strings.NewReader(`{"sessionId":"session-1","baseImageIndex":1,"alignmentMethod":"stars","transformModel":"homography"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	var created usecase.AlignmentJobResponse
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.AlignmentJobID == "" {
		t.Fatal("expected alignment job id")
	}
	if created.AlignmentMethod != "stars" {
		t.Fatalf("created alignment method = %q", created.AlignmentMethod)
	}
	if created.TransformModel != "homography" {
		t.Fatalf("created transform model = %q", created.TransformModel)
	}

	body := waitForAlignmentJobStatus(t, router, created.AlignmentJobID, "completed")
	if processor.transformRequest.GetBaseImageIndex() != 1 {
		t.Fatalf("base image index = %d", processor.transformRequest.GetBaseImageIndex())
	}
	if processor.transformRequest.GetAlignmentMethod() != "stars" {
		t.Fatalf("worker alignment method = %q", processor.transformRequest.GetAlignmentMethod())
	}
	if processor.transformRequest.GetTransformModel() != "homography" {
		t.Fatalf("worker transform model = %q", processor.transformRequest.GetTransformModel())
	}
	if len(processor.transformRequest.GetImages()) != 2 {
		t.Fatalf("worker images = %d", len(processor.transformRequest.GetImages()))
	}

	if len(body.Transforms) != 2 {
		t.Fatalf("transforms = %#v", body.Transforms)
	}
	if body.Transforms[1].Affine[2] != 1 {
		t.Fatalf("second transform = %#v", body.Transforms[1])
	}
	if body.Transforms[1].Homography[2] != 1 {
		t.Fatalf("second homography = %#v", body.Transforms[1])
	}
	if body.Transforms[1].TransformModel != "homography" {
		t.Fatalf("second transform model = %#v", body.Transforms[1])
	}
	if len(body.Warnings) != 1 || body.Warnings[0].Code != "TEST_TRANSFORM_WARNING" {
		t.Fatalf("warnings = %#v", body.Warnings)
	}
	if body.AlignmentMethod != "stars" {
		t.Fatalf("completed alignment method = %q", body.AlignmentMethod)
	}
	if body.TransformModel != "homography" {
		t.Fatalf("completed transform model = %q", body.TransformModel)
	}
}

func TestPreviewAlignmentMarksWorkerErrorAsFailed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dataDir := t.TempDir()
	sessionDir := filepath.Join(dataDir, "uploads", "previews", "session-1")
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sessionDir, "0001-frame.jpg"), []byte("preview"), 0o644); err != nil {
		t.Fatal(err)
	}

	router := newRouterWithProcessor(dataDir, &fakeProcessor{err: errors.New("worker unavailable")})

	request := httptest.NewRequest(http.MethodPost, "/api/preview-alignments", strings.NewReader(`{"sessionId":"session-1"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	var created usecase.AlignmentJobResponse
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}

	job := waitForAlignmentJobStatus(t, router, created.AlignmentJobID, "failed")
	if !strings.Contains(job.Error, "worker unavailable") {
		t.Fatalf("job error = %q", job.Error)
	}
	if job.AlignmentMethod != "akaze" {
		t.Fatalf("default alignment method = %q", job.AlignmentMethod)
	}
	if job.TransformModel != "affine" {
		t.Fatalf("default transform model = %q", job.TransformModel)
	}
}

func TestCleanupExpiredRemovesOldPreviewSessionAndTerminalJobs(t *testing.T) {
	dataDir := t.TempDir()
	jobs := newTestPreviewJobs(t, dataDir)
	now := time.Date(2026, 6, 27, 12, 0, 0, 0, time.UTC)
	oldTime := now.Add(-25 * time.Hour)

	createPreviewSession(t, dataDir, "session-old", oldTime)
	outputPath := filepath.Join(dataDir, "jobs", "job-old", "result.jpg")
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outputPath, []byte("result"), 0o644); err != nil {
		t.Fatal(err)
	}
	jobs.Jobs.Put(&usecase.JobResponse{
		JobID:      "job-old",
		Status:     "completed",
		SessionID:  "session-old",
		OutputPath: outputPath,
		CreatedAt:  oldTime,
		UpdatedAt:  oldTime,
	})
	jobs.AlignmentJobs.Put(&usecase.AlignmentJobResponse{
		AlignmentJobID: "alignment-old",
		Status:         "failed",
		SessionID:      "session-old",
		CreatedAt:      oldTime,
		UpdatedAt:      oldTime,
	})

	result, err := jobs.CleanupExpired(now, 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	if result.DeletedPreviewSessions != 1 || result.DeletedCompositeJobs != 1 || result.DeletedAlignmentJobs != 1 {
		t.Fatalf("cleanup result = %#v", result)
	}
	if _, err := os.Stat(filepath.Join(dataDir, "uploads", "previews", "session-old")); !os.IsNotExist(err) {
		t.Fatalf("expected preview session deleted, stat err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, "jobs", "job-old")); !os.IsNotExist(err) {
		t.Fatalf("expected job directory deleted, stat err = %v", err)
	}
	if _, ok := jobs.GetCompositeJob("job-old"); ok {
		t.Fatal("expected composite job state deleted")
	}
	if _, ok := jobs.GetAlignmentJob("alignment-old"); ok {
		t.Fatal("expected alignment job state deleted")
	}
}

func TestCleanupExpiredKeepsPreviewSessionReferencedByRunningJob(t *testing.T) {
	dataDir := t.TempDir()
	jobs := newTestPreviewJobs(t, dataDir)
	now := time.Date(2026, 6, 27, 12, 0, 0, 0, time.UTC)
	oldTime := now.Add(-25 * time.Hour)

	createPreviewSession(t, dataDir, "session-running", oldTime)
	jobs.AlignmentJobs.Put(&usecase.AlignmentJobResponse{
		AlignmentJobID: "alignment-running",
		Status:         "running",
		SessionID:      "session-running",
		CreatedAt:      oldTime,
		UpdatedAt:      oldTime,
	})

	result, err := jobs.CleanupExpired(now, 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	if result.DeletedPreviewSessions != 0 || result.DeletedAlignmentJobs != 0 {
		t.Fatalf("cleanup result = %#v", result)
	}
	if _, err := os.Stat(filepath.Join(dataDir, "uploads", "previews", "session-running")); err != nil {
		t.Fatalf("expected running session to remain: %v", err)
	}
	if _, ok := jobs.GetAlignmentJob("alignment-running"); !ok {
		t.Fatal("expected running alignment job state to remain")
	}
}

func TestCleanupExpiredKeepsPreviewSessionReferencedByRecentTerminalJob(t *testing.T) {
	dataDir := t.TempDir()
	jobs := newTestPreviewJobs(t, dataDir)
	now := time.Date(2026, 6, 27, 12, 0, 0, 0, time.UTC)
	oldTime := now.Add(-25 * time.Hour)

	createPreviewSession(t, dataDir, "session-recent", oldTime)
	jobs.AlignmentJobs.Put(&usecase.AlignmentJobResponse{
		AlignmentJobID: "alignment-recent",
		Status:         "completed",
		SessionID:      "session-recent",
		CreatedAt:      oldTime,
		UpdatedAt:      now.Add(-time.Hour),
	})

	result, err := jobs.CleanupExpired(now, 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	if result.DeletedPreviewSessions != 0 || result.DeletedAlignmentJobs != 0 {
		t.Fatalf("cleanup result = %#v", result)
	}
	if _, err := os.Stat(filepath.Join(dataDir, "uploads", "previews", "session-recent")); err != nil {
		t.Fatalf("expected recent terminal session to remain: %v", err)
	}
	if _, ok := jobs.GetAlignmentJob("alignment-recent"); !ok {
		t.Fatal("expected recent alignment job state to remain")
	}
}

func waitForJobStatus(t *testing.T, router http.Handler, jobID string, status string) usecase.JobResponse {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		request := httptest.NewRequest(http.MethodGet, "/api/jobs/"+jobID, nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("status response = %d, body = %s", response.Code, response.Body.String())
		}

		var job usecase.JobResponse
		if err := json.Unmarshal(response.Body.Bytes(), &job); err != nil {
			t.Fatal(err)
		}
		if job.Status == status {
			return job
		}

		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("job %s did not reach status %s", jobID, status)
	return usecase.JobResponse{}
}

func waitForAlignmentJobStatus(t *testing.T, router http.Handler, jobID string, status string) usecase.AlignmentJobResponse {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		request := httptest.NewRequest(http.MethodGet, "/api/preview-alignments/"+jobID, nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("status response = %d, body = %s", response.Code, response.Body.String())
		}

		var job usecase.AlignmentJobResponse
		if err := json.Unmarshal(response.Body.Bytes(), &job); err != nil {
			t.Fatal(err)
		}
		if job.Status == status {
			return job
		}

		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("preview alignment job %s did not reach status %s", jobID, status)
	return usecase.AlignmentJobResponse{}
}

func newTestPreviewJobs(t *testing.T, dataDir string) *usecase.PreviewJobs {
	t.Helper()

	storage, err := service.NewPreviewStorage(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	return usecase.NewPreviewJobs(storage.DataDir, storage, &fakeProcessor{})
}

func createPreviewSession(t *testing.T, dataDir string, sessionID string, modTime time.Time) {
	t.Helper()

	sessionDir := filepath.Join(dataDir, "uploads", "previews", sessionID)
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sessionDir, "0001-frame.jpg"), []byte("preview"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(sessionDir, modTime, modTime); err != nil {
		t.Fatal(err)
	}
}
