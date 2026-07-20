package main

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	eventsRegistryKey = "gate:events"
	botPrefix         = "bot:"
	admittedMarker    = "1"
)

var admitScript = redis.NewScript(`
local batch = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local admitPrefix = ARGV[3]
local bot = ARGV[4]
local eventID = ARGV[5]
local admitted = {}
local popped = redis.call('ZPOPMIN', KEYS[1], batch)
for i = 1, #popped, 2 do
  local member = popped[i]
  if string.sub(member, 1, string.len(bot)) ~= bot then
    redis.call('SET', admitPrefix .. member, '1', 'EX', ttl)
    admitted[#admitted + 1] = member
  end
end
if redis.call('ZCARD', KEYS[1]) == 0 then
  redis.call('SREM', KEYS[2], eventID)
end
return admitted
`)

var errNotQueued = errors.New("visitor not in queue")

type Queue struct {
	rdb *redis.Client
	ttl time.Duration
}

func newQueue(rdb *redis.Client, ttl time.Duration) *Queue {
	return &Queue{rdb: rdb, ttl: ttl}
}

func queueKey(eventID string) string { return "gate:" + eventID + ":q" }

func admitKeyPrefix(eventID string) string { return "gate:" + eventID + ":adm:" }

func admitKey(eventID, visitorID string) string {
	return admitKeyPrefix(eventID) + visitorID
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
	value, err := q.rdb.Get(ctx, admitKey(eventID, visitorID)).Result()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return value == admittedMarker, nil
}

func (q *Queue) Simulate(ctx context.Context, eventID string, count int) (int64, error) {
	base := float64(time.Now().UnixMilli())
	members := make([]redis.Z, 0, count)
	for i := 0; i < count; i++ {
		members = append(members, redis.Z{
			Score:  base + float64(i)/float64(count+1),
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
	if batch <= 0 {
		return 0, nil
	}
	result, err := admitScript.Run(
		ctx,
		q.rdb,
		[]string{queueKey(eventID), eventsRegistryKey},
		batch,
		int(q.ttl.Seconds()),
		admitKeyPrefix(eventID),
		botPrefix,
		eventID,
	).Result()
	if err != nil {
		return 0, err
	}
	members, ok := result.([]any)
	if !ok {
		return 0, nil
	}
	if len(members) > 0 {
		admittedTotal.Add(ctx, int64(len(members)))
	}
	return len(members), nil
}

func (q *Queue) ActiveEvents(ctx context.Context) ([]string, error) {
	return q.rdb.SMembers(ctx, eventsRegistryKey).Result()
}
