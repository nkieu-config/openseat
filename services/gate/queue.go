package main

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	eventsRegistryKey = "gate:events"
	botPrefix         = "bot:"
)

var errNotQueued = errors.New("visitor not in queue")

type Queue struct {
	rdb *redis.Client
	ttl time.Duration
}

func newQueue(rdb *redis.Client, ttl time.Duration) *Queue {
	return &Queue{rdb: rdb, ttl: ttl}
}

func queueKey(eventID string) string { return "gate:" + eventID + ":q" }

func admitKey(eventID, visitorID string) string {
	return "gate:" + eventID + ":adm:" + visitorID
}

func (q *Queue) Join(ctx context.Context, eventID, visitorID string) (int64, int64, error) {
	pipe := q.rdb.TxPipeline()
	pipe.SAdd(ctx, eventsRegistryKey, eventID)
	pipe.ZAddNX(ctx, queueKey(eventID), redis.Z{
		Score:  float64(time.Now().UnixMilli()),
		Member: visitorID,
	})
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, 0, err
	}
	joinsTotal.Add(ctx, 1)
	return q.Position(ctx, eventID, visitorID)
}

func (q *Queue) Position(ctx context.Context, eventID, visitorID string) (int64, int64, error) {
	rank, err := q.rdb.ZRank(ctx, queueKey(eventID), visitorID).Result()
	if errors.Is(err, redis.Nil) {
		total, _ := q.rdb.ZCard(ctx, queueKey(eventID)).Result()
		return 0, total, errNotQueued
	}
	if err != nil {
		return 0, 0, err
	}
	total, err := q.rdb.ZCard(ctx, queueKey(eventID)).Result()
	if err != nil {
		return 0, 0, err
	}
	return rank + 1, total, nil
}

func (q *Queue) IsAdmitted(ctx context.Context, eventID, visitorID string) (bool, error) {
	count, err := q.rdb.Exists(ctx, admitKey(eventID, visitorID)).Result()
	return count > 0, err
}

func (q *Queue) Simulate(ctx context.Context, eventID string, count int) (int64, error) {
	base := float64(time.Now().UnixMilli())
	front, err := q.rdb.ZRangeWithScores(ctx, queueKey(eventID), 0, 0).Result()
	if err == nil && len(front) > 0 {
		base = front[0].Score
	}
	members := make([]redis.Z, 0, count)
	for i := 0; i < count; i++ {
		members = append(members, redis.Z{
			Score:  base - float64(i+1),
			Member: botPrefix + randomID(),
		})
	}
	pipe := q.rdb.TxPipeline()
	pipe.SAdd(ctx, eventsRegistryKey, eventID)
	pipe.ZAdd(ctx, queueKey(eventID), members...)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return q.rdb.ZCard(ctx, queueKey(eventID)).Result()
}

func (q *Queue) Admit(ctx context.Context, eventID string, batch int) (int, error) {
	popped, err := q.rdb.ZPopMin(ctx, queueKey(eventID), int64(batch)).Result()
	if err != nil {
		return 0, err
	}
	admitted := 0
	for _, entry := range popped {
		visitorID, _ := entry.Member.(string)
		if strings.HasPrefix(visitorID, botPrefix) {
			continue
		}
		if err := q.rdb.Set(ctx, admitKey(eventID, visitorID), "1", q.ttl).Err(); err != nil {
			return admitted, err
		}
		admitted++
	}
	if admitted > 0 {
		admittedTotal.Add(ctx, int64(admitted))
	}
	return admitted, nil
}

func (q *Queue) ActiveEvents(ctx context.Context) ([]string, error) {
	return q.rdb.SMembers(ctx, eventsRegistryKey).Result()
}
