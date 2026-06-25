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
			ImageIndex: uint32(index),
			Affine:     []float64{1, 0, float64(index), 0, 1, 0},
			Estimated:  true,
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

	request := httptest.NewRequest(http.MethodPost, "/api/preview-alignments", strings.NewReader(`{"sessionId":"session-1","baseImageIndex":1}`))
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

	body := waitForAlignmentJobStatus(t, router, created.AlignmentJobID, "completed")
	if processor.transformRequest.GetBaseImageIndex() != 1 {
		t.Fatalf("base image index = %d", processor.transformRequest.GetBaseImageIndex())
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
	if len(body.Warnings) != 1 || body.Warnings[0].Code != "TEST_TRANSFORM_WARNING" {
		t.Fatalf("warnings = %#v", body.Warnings)
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
