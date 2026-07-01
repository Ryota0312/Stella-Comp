package usecase

import (
	"encoding/json"
	"fmt"
	"sync"
)

type CompositeJobStateStore interface {
	Put(job *JobResponse) error
	Get(jobID string) (*JobResponse, bool)
	List() []*JobResponse
	Update(jobID string, update func(job *JobResponse)) error
	Delete(jobID string) error
}

type AlignmentJobStateStore interface {
	Put(job *AlignmentJobResponse) error
	Get(jobID string) (*AlignmentJobResponse, bool)
	List() []*AlignmentJobResponse
	Update(jobID string, update func(job *AlignmentJobResponse)) error
	Delete(jobID string) error
}

type JobStore struct {
	mu   sync.RWMutex
	jobs map[string]*JobResponse
}

type AlignmentJobStore struct {
	mu   sync.RWMutex
	jobs map[string]*AlignmentJobResponse
}

func NewJobStore() *JobStore {
	return &JobStore{jobs: map[string]*JobResponse{}}
}

func NewAlignmentJobStore() *AlignmentJobStore {
	return &AlignmentJobStore{jobs: map[string]*AlignmentJobResponse{}}
}

func (store *JobStore) Put(job *JobResponse) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.jobs[job.JobID] = cloneJob(job)
	return nil
}

func (store *JobStore) Get(jobID string) (*JobResponse, bool) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	job, ok := store.jobs[jobID]
	if !ok {
		return nil, false
	}

	return cloneJob(job), true
}

func (store *JobStore) List() []*JobResponse {
	store.mu.RLock()
	defer store.mu.RUnlock()

	jobs := make([]*JobResponse, 0, len(store.jobs))
	for _, job := range store.jobs {
		jobs = append(jobs, cloneJob(job))
	}
	return jobs
}

func (store *JobStore) Update(jobID string, update func(job *JobResponse)) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	job, ok := store.jobs[jobID]
	if !ok {
		return nil
	}

	update(job)
	return nil
}

func (store *JobStore) Delete(jobID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.jobs, jobID)
	return nil
}

func (store *AlignmentJobStore) Put(job *AlignmentJobResponse) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.jobs[job.AlignmentJobID] = cloneAlignmentJob(job)
	return nil
}

func (store *AlignmentJobStore) Get(jobID string) (*AlignmentJobResponse, bool) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	job, ok := store.jobs[jobID]
	if !ok {
		return nil, false
	}

	return cloneAlignmentJob(job), true
}

func (store *AlignmentJobStore) List() []*AlignmentJobResponse {
	store.mu.RLock()
	defer store.mu.RUnlock()

	jobs := make([]*AlignmentJobResponse, 0, len(store.jobs))
	for _, job := range store.jobs {
		jobs = append(jobs, cloneAlignmentJob(job))
	}
	return jobs
}

func (store *AlignmentJobStore) Update(jobID string, update func(job *AlignmentJobResponse)) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	job, ok := store.jobs[jobID]
	if !ok {
		return nil
	}

	update(job)
	return nil
}

func (store *AlignmentJobStore) Delete(jobID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.jobs, jobID)
	return nil
}

func cloneJob(job *JobResponse) *JobResponse {
	cloned := *job
	cloned.PreviewPaths = append([]string(nil), job.PreviewPaths...)
	cloned.Warnings = append([]ProcessingWarning(nil), job.Warnings...)
	return &cloned
}

func cloneAlignmentJob(job *AlignmentJobResponse) *AlignmentJobResponse {
	cloned := *job
	cloned.PreviewPaths = append([]string(nil), job.PreviewPaths...)
	cloned.Transforms = append([]ImageTransform(nil), job.Transforms...)
	for index := range cloned.Transforms {
		cloned.Transforms[index].Affine = append([]float64(nil), job.Transforms[index].Affine...)
	}
	cloned.Warnings = append([]ProcessingWarning(nil), job.Warnings...)
	return &cloned
}

func marshalJobPayload(job any) (string, error) {
	payload, err := json.Marshal(job)
	if err != nil {
		return "", fmt.Errorf("marshal job state: %w", err)
	}
	return string(payload), nil
}
