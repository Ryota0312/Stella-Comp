package usecase

import (
	"context"
	"time"

	stellacompv1 "github.com/Ryota0312/stella-comp/apps/api/internal/gen/stellacomp/v1"
)

type Processor interface {
	AlignAndAverage(ctx context.Context, request *stellacompv1.AlignAndAverageRequest) (*stellacompv1.AlignAndAverageResponse, error)
	EstimateTransforms(ctx context.Context, request *stellacompv1.EstimateTransformsRequest) (*stellacompv1.EstimateTransformsResponse, error)
}

type CreateJobRequest struct {
	SessionID      string   `json:"sessionId"`
	PreviewPaths   []string `json:"previewPaths"`
	BaseImageIndex int      `json:"baseImageIndex"`
}

type EstimateTransformsRequest struct {
	SessionID       string   `json:"sessionId"`
	PreviewPaths    []string `json:"previewPaths"`
	BaseImageIndex  int      `json:"baseImageIndex"`
	AlignmentMethod string   `json:"alignmentMethod"`
}

type AlignmentJobResponse struct {
	AlignmentJobID  string              `json:"alignmentJobId"`
	Status          string              `json:"status"`
	SessionID       string              `json:"sessionId"`
	BaseImageIndex  int                 `json:"baseImageIndex"`
	AlignmentMethod string              `json:"alignmentMethod"`
	PreviewPaths    []string            `json:"previewPaths"`
	Transforms      []ImageTransform    `json:"transforms,omitempty"`
	Error           string              `json:"error,omitempty"`
	Warnings        []ProcessingWarning `json:"warnings,omitempty"`
	CreatedAt       time.Time           `json:"createdAt"`
	UpdatedAt       time.Time           `json:"updatedAt"`
}

type ImageTransform struct {
	ImageIndex uint32    `json:"imageIndex"`
	Affine     []float64 `json:"affine"`
	Estimated  bool      `json:"estimated"`
}

type JobResponse struct {
	JobID          string              `json:"jobId"`
	Status         string              `json:"status"`
	SessionID      string              `json:"sessionId"`
	BaseImageIndex int                 `json:"baseImageIndex"`
	PreviewPaths   []string            `json:"previewPaths"`
	OutputPath     string              `json:"outputPath,omitempty"`
	Error          string              `json:"error,omitempty"`
	Warnings       []ProcessingWarning `json:"warnings,omitempty"`
	CreatedAt      time.Time           `json:"createdAt"`
	UpdatedAt      time.Time           `json:"updatedAt"`
}

type ProcessingWarning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
