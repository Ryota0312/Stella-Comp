package usecase

import (
	"context"
	"errors"
	"sync"
)

var ErrNoQueuedJob = errors.New("no queued job")

type QueuedJob struct {
	ID       string
	Ack      func(context.Context) error
	Attempts int64
}

type JobQueue interface {
	EnqueueComposite(ctx context.Context, jobID string) error
	EnqueueAlignment(ctx context.Context, jobID string) error
	ClaimComposite(ctx context.Context) (QueuedJob, error)
	ClaimAlignment(ctx context.Context) (QueuedJob, error)
}

type MemoryJobQueue struct {
	composite chan string
	alignment chan string
}

func NewMemoryJobQueue() *MemoryJobQueue {
	return &MemoryJobQueue{
		composite: make(chan string, 1024),
		alignment: make(chan string, 1024),
	}
}

func (queue *MemoryJobQueue) EnqueueComposite(ctx context.Context, jobID string) error {
	return enqueueMemoryJob(ctx, queue.composite, jobID)
}

func (queue *MemoryJobQueue) EnqueueAlignment(ctx context.Context, jobID string) error {
	return enqueueMemoryJob(ctx, queue.alignment, jobID)
}

func (queue *MemoryJobQueue) ClaimComposite(ctx context.Context) (QueuedJob, error) {
	return claimMemoryJob(ctx, queue.composite)
}

func (queue *MemoryJobQueue) ClaimAlignment(ctx context.Context) (QueuedJob, error) {
	return claimMemoryJob(ctx, queue.alignment)
}

func enqueueMemoryJob(ctx context.Context, jobs chan<- string, jobID string) error {
	select {
	case jobs <- jobID:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func claimMemoryJob(ctx context.Context, jobs <-chan string) (QueuedJob, error) {
	select {
	case jobID := <-jobs:
		return QueuedJob{ID: jobID, Ack: func(context.Context) error { return nil }}, nil
	case <-ctx.Done():
		return QueuedJob{}, ctx.Err()
	}
}

type CleanupLocker interface {
	WithCleanupLock(ctx context.Context, fn func() error) (bool, error)
}

type LocalCleanupLocker struct {
	mu sync.Mutex
}

func (locker *LocalCleanupLocker) WithCleanupLock(_ context.Context, fn func() error) (bool, error) {
	if !locker.mu.TryLock() {
		return false, nil
	}
	defer locker.mu.Unlock()
	return true, fn()
}
