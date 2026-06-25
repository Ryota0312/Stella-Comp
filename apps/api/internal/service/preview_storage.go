package service

import (
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type PreviewStorage struct {
	DataDir string
}

type UploadedPreview struct {
	FieldName string `json:"fieldName"`
	FileName  string `json:"fileName"`
	Path      string `json:"path"`
	Size      int64  `json:"size"`
}

func NewPreviewStorage(dataDir string) (PreviewStorage, error) {
	absoluteDataDir, err := filepath.Abs(dataDir)
	if err != nil {
		return PreviewStorage{}, err
	}

	return PreviewStorage{DataDir: absoluteDataDir}, nil
}

func (storage PreviewStorage) SavePreviews(sessionID string, files []*multipart.FileHeader) ([]UploadedPreview, int64, error) {
	sessionDir := filepath.Join(storage.DataDir, "uploads", "previews", SafePathSegment(sessionID))
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		return nil, 0, err
	}

	uploaded := make([]UploadedPreview, 0, len(files))
	var uploadedBytes int64
	for index, fileHeader := range files {
		fileName := IndexedFileName(index, SafeFileName(fileHeader.Filename))
		if fileName == "" {
			fileName = fmt.Sprintf("preview-%04d.jpg", index+1)
		}

		destination := filepath.Join(sessionDir, fileName)
		size, err := saveMultipartFile(fileHeader, destination)
		if err != nil {
			return nil, 0, err
		}

		uploaded = append(uploaded, UploadedPreview{
			FieldName: "previews",
			FileName:  fileName,
			Path:      destination,
			Size:      size,
		})
		uploadedBytes += size
	}

	return uploaded, uploadedBytes, nil
}

func (storage PreviewStorage) PathsForSession(sessionID string) ([]string, error) {
	sessionDir := filepath.Join(storage.DataDir, "uploads", "previews", sessionID)
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

func (storage PreviewStorage) ValidatePaths(sessionID string, paths []string) ([]string, error) {
	sessionDir, err := filepath.Abs(filepath.Join(storage.DataDir, "uploads", "previews", sessionID))
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

func SafeFileName(fileName string) string {
	base := filepath.Base(strings.TrimSpace(fileName))
	base = strings.ReplaceAll(base, string(filepath.Separator), "_")
	base = strings.ReplaceAll(base, "/", "_")
	base = strings.ReplaceAll(base, "\\", "_")

	if base == "." || base == string(filepath.Separator) {
		return ""
	}

	return base
}

func SafePathSegment(value string) string {
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

func IndexedFileName(index int, fileName string) string {
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
