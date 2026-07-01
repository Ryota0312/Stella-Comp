package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	redisCompositeQueue     = "stella:queue:composite"
	redisAlignmentQueue     = "stella:queue:preview_alignment"
	redisCompositeJobPrefix = "stella:job:composite:"
	redisAlignmentJobPrefix = "stella:job:alignment:"
	redisConsumerGroup      = "stella-api"
)

type RedisBackend struct {
	client       redis.UniversalClient
	consumerName string
	claimMinIdle time.Duration
	cleanupTTL   time.Duration
}

func NewRedisBackend(ctx context.Context, client redis.UniversalClient, consumerName string) (*RedisBackend, error) {
	backend := &RedisBackend{
		client:       client,
		consumerName: strings.TrimSpace(consumerName),
		claimMinIdle: time.Minute,
		cleanupTTL:   10 * time.Minute,
	}
	if backend.consumerName == "" {
		backend.consumerName = fmt.Sprintf("api-%d", time.Now().UnixNano())
	}
	for _, stream := range []string{redisCompositeQueue, redisAlignmentQueue} {
		if err := createConsumerGroup(ctx, client, stream); err != nil {
			return nil, err
		}
	}
	return backend, nil
}

func NewRedisClientFromURL(queueURL string) (redis.UniversalClient, error) {
	options, err := redis.ParseURL(queueURL)
	if err != nil {
		return nil, err
	}
	return redis.NewClient(options), nil
}

func createConsumerGroup(ctx context.Context, client redis.UniversalClient, stream string) error {
	err := client.XGroupCreateMkStream(ctx, stream, redisConsumerGroup, "0").Err()
	if err == nil || strings.Contains(err.Error(), "BUSYGROUP") {
		return nil
	}
	return fmt.Errorf("create redis consumer group for %s: %w", stream, err)
}

func (backend *RedisBackend) Put(job *JobResponse) error {
	return backend.putJSON(redisCompositeJobPrefix+job.JobID, job)
}

func (backend *RedisBackend) Get(jobID string) (*JobResponse, bool) {
	var job JobResponse
	ok, err := backend.getJSON(redisCompositeJobPrefix+jobID, &job)
	if err != nil {
		log.Printf("get redis composite job %s failed: %v", jobID, err)
		return nil, false
	}
	if !ok {
		return nil, false
	}
	return cloneJob(&job), true
}

func (backend *RedisBackend) List() []*JobResponse {
	ctx := context.Background()
	keys, err := scanKeys(ctx, backend.client, redisCompositeJobPrefix+"*")
	if err != nil {
		log.Printf("list redis composite jobs failed: %v", err)
		return nil
	}
	jobs := make([]*JobResponse, 0, len(keys))
	for _, key := range keys {
		var job JobResponse
		ok, err := backend.getJSON(key, &job)
		if err != nil {
			log.Printf("get redis composite job %s failed: %v", key, err)
			continue
		}
		if ok {
			jobs = append(jobs, cloneJob(&job))
		}
	}
	return jobs
}

func (backend *RedisBackend) Update(jobID string, update func(job *JobResponse)) error {
	key := redisCompositeJobPrefix + jobID
	var job JobResponse
	ok, err := backend.getJSON(key, &job)
	if err != nil || !ok {
		return err
	}
	update(&job)
	return backend.putJSON(key, &job)
}

func (backend *RedisBackend) Delete(jobID string) error {
	return backend.client.Del(context.Background(), redisCompositeJobPrefix+jobID).Err()
}

func (backend *RedisBackend) PutAlignment(job *AlignmentJobResponse) error {
	return backend.putJSON(redisAlignmentJobPrefix+job.AlignmentJobID, job)
}

func (backend *RedisBackend) GetAlignment(jobID string) (*AlignmentJobResponse, bool) {
	var job AlignmentJobResponse
	ok, err := backend.getJSON(redisAlignmentJobPrefix+jobID, &job)
	if err != nil {
		log.Printf("get redis alignment job %s failed: %v", jobID, err)
		return nil, false
	}
	if !ok {
		return nil, false
	}
	return cloneAlignmentJob(&job), true
}

func (backend *RedisBackend) ListAlignment() []*AlignmentJobResponse {
	ctx := context.Background()
	keys, err := scanKeys(ctx, backend.client, redisAlignmentJobPrefix+"*")
	if err != nil {
		log.Printf("list redis alignment jobs failed: %v", err)
		return nil
	}
	jobs := make([]*AlignmentJobResponse, 0, len(keys))
	for _, key := range keys {
		var job AlignmentJobResponse
		ok, err := backend.getJSON(key, &job)
		if err != nil {
			log.Printf("get redis alignment job %s failed: %v", key, err)
			continue
		}
		if ok {
			jobs = append(jobs, cloneAlignmentJob(&job))
		}
	}
	return jobs
}

func (backend *RedisBackend) UpdateAlignment(jobID string, update func(job *AlignmentJobResponse)) error {
	key := redisAlignmentJobPrefix + jobID
	var job AlignmentJobResponse
	ok, err := backend.getJSON(key, &job)
	if err != nil || !ok {
		return err
	}
	update(&job)
	return backend.putJSON(key, &job)
}

func (backend *RedisBackend) DeleteAlignment(jobID string) error {
	return backend.client.Del(context.Background(), redisAlignmentJobPrefix+jobID).Err()
}

func (backend *RedisBackend) EnqueueComposite(ctx context.Context, jobID string) error {
	return backend.enqueue(ctx, redisCompositeQueue, jobID)
}

func (backend *RedisBackend) EnqueueAlignment(ctx context.Context, jobID string) error {
	return backend.enqueue(ctx, redisAlignmentQueue, jobID)
}

func (backend *RedisBackend) ClaimComposite(ctx context.Context) (QueuedJob, error) {
	return backend.claim(ctx, redisCompositeQueue)
}

func (backend *RedisBackend) ClaimAlignment(ctx context.Context) (QueuedJob, error) {
	return backend.claim(ctx, redisAlignmentQueue)
}

func (backend *RedisBackend) WithCleanupLock(ctx context.Context, fn func() error) (bool, error) {
	key := "stella:lock:cleanup"
	token := strconv.FormatInt(time.Now().UnixNano(), 10)
	ok, err := backend.client.SetNX(ctx, key, token, backend.cleanupTTL).Result()
	if err != nil || !ok {
		return ok, err
	}
	defer func() {
		value, err := backend.client.Get(ctx, key).Result()
		if err == nil && value == token {
			if err := backend.client.Del(ctx, key).Err(); err != nil {
				log.Printf("release cleanup lock failed: %v", err)
			}
		}
	}()
	return true, fn()
}

func (backend *RedisBackend) enqueue(ctx context.Context, stream string, jobID string) error {
	return backend.client.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		Values: map[string]any{"jobID": jobID},
	}).Err()
}

func (backend *RedisBackend) claim(ctx context.Context, stream string) (QueuedJob, error) {
	if job, ok, err := backend.claimPending(ctx, stream); err != nil || ok {
		return job, err
	}

	result, err := backend.client.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    redisConsumerGroup,
		Consumer: backend.consumerName,
		Streams:  []string{stream, ">"},
		Count:    1,
		Block:    time.Second,
	}).Result()
	if errors.Is(err, redis.Nil) {
		return QueuedJob{}, ErrNoQueuedJob
	}
	if err != nil {
		return QueuedJob{}, err
	}
	return backend.messageToQueuedJob(stream, result)
}

func (backend *RedisBackend) claimPending(ctx context.Context, stream string) (QueuedJob, bool, error) {
	messages, _, err := backend.client.XAutoClaim(ctx, &redis.XAutoClaimArgs{
		Stream:   stream,
		Group:    redisConsumerGroup,
		Consumer: backend.consumerName,
		MinIdle:  backend.claimMinIdle,
		Start:    "0-0",
		Count:    1,
	}).Result()
	if errors.Is(err, redis.Nil) {
		return QueuedJob{}, false, nil
	}
	if err != nil {
		return QueuedJob{}, false, err
	}
	if len(messages) == 0 {
		return QueuedJob{}, false, nil
	}
	job, err := backend.messageToQueuedJob(stream, []redis.XStream{{Stream: stream, Messages: messages}})
	return job, err == nil, err
}

func (backend *RedisBackend) messageToQueuedJob(stream string, streams []redis.XStream) (QueuedJob, error) {
	if len(streams) == 0 || len(streams[0].Messages) == 0 {
		return QueuedJob{}, ErrNoQueuedJob
	}
	message := streams[0].Messages[0]
	rawJobID, ok := message.Values["jobID"]
	if !ok {
		return QueuedJob{}, fmt.Errorf("redis stream message %s missing jobID", message.ID)
	}
	jobID := fmt.Sprint(rawJobID)
	return QueuedJob{
		ID: jobID,
		Ack: func(ctx context.Context) error {
			pipeline := backend.client.Pipeline()
			pipeline.XAck(ctx, stream, redisConsumerGroup, message.ID)
			pipeline.XDel(ctx, stream, message.ID)
			_, err := pipeline.Exec(ctx)
			return err
		},
	}, nil
}

func (backend *RedisBackend) putJSON(key string, value any) error {
	payload, err := marshalJobPayload(value)
	if err != nil {
		return err
	}
	return backend.client.HSet(context.Background(), key, "data", payload).Err()
}

func (backend *RedisBackend) getJSON(key string, target any) (bool, error) {
	payload, err := backend.client.HGet(context.Background(), key, "data").Result()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := json.Unmarshal([]byte(payload), target); err != nil {
		return false, fmt.Errorf("unmarshal redis job state %s: %w", key, err)
	}
	return true, nil
}

func scanKeys(ctx context.Context, client redis.UniversalClient, pattern string) ([]string, error) {
	var cursor uint64
	keys := []string{}
	for {
		batch, nextCursor, err := client.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return nil, err
		}
		keys = append(keys, batch...)
		cursor = nextCursor
		if cursor == 0 {
			return keys, nil
		}
	}
}

type RedisAlignmentJobStore struct {
	backend *RedisBackend
}

func (store RedisAlignmentJobStore) Put(job *AlignmentJobResponse) error {
	return store.backend.PutAlignment(job)
}

func (store RedisAlignmentJobStore) Get(jobID string) (*AlignmentJobResponse, bool) {
	return store.backend.GetAlignment(jobID)
}

func (store RedisAlignmentJobStore) List() []*AlignmentJobResponse {
	return store.backend.ListAlignment()
}

func (store RedisAlignmentJobStore) Update(jobID string, update func(job *AlignmentJobResponse)) error {
	return store.backend.UpdateAlignment(jobID, update)
}

func (store RedisAlignmentJobStore) Delete(jobID string) error {
	return store.backend.DeleteAlignment(jobID)
}
