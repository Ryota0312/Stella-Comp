package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

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

	var upload uploadResponse
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
