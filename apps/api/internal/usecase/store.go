package usecase

import "sync"

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

func (store *JobStore) Put(job *JobResponse) {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.jobs[job.JobID] = cloneJob(job)
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

func (store *JobStore) Update(jobID string, update func(job *JobResponse)) {
	store.mu.Lock()
	defer store.mu.Unlock()
	job, ok := store.jobs[jobID]
	if !ok {
		return
	}

	update(job)
}

func (store *AlignmentJobStore) Put(job *AlignmentJobResponse) {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.jobs[job.AlignmentJobID] = cloneAlignmentJob(job)
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

func (store *AlignmentJobStore) Update(jobID string, update func(job *AlignmentJobResponse)) {
	store.mu.Lock()
	defer store.mu.Unlock()
	job, ok := store.jobs[jobID]
	if !ok {
		return
	}

	update(job)
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
