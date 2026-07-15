package main

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newTestQueue(t *testing.T) *Queue {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis: %v", err)
	}
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	return newQueue(rdb, time.Minute)
}

func TestJoinAssignsPositionsInOrder(t *testing.T) {
	q := newTestQueue(t)
	ctx := context.Background()

	pos1, _, err := q.Join(ctx, "e", "a")
	if err != nil {
		t.Fatal(err)
	}
	pos2, total, err := q.Join(ctx, "e", "b")
	if err != nil {
		t.Fatal(err)
	}
	if pos1 != 1 || pos2 != 2 || total != 2 {
		t.Fatalf("positions: pos1=%d pos2=%d total=%d", pos1, pos2, total)
	}
}

func TestAdmitPopsFrontAndMarksAdmitted(t *testing.T) {
	q := newTestQueue(t)
	ctx := context.Background()

	if _, _, err := q.Join(ctx, "e", "a"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := q.Join(ctx, "e", "b"); err != nil {
		t.Fatal(err)
	}

	admitted, err := q.Admit(ctx, "e", 1)
	if err != nil {
		t.Fatal(err)
	}
	if admitted != 1 {
		t.Fatalf("expected 1 admitted, got %d", admitted)
	}
	if ok, _ := q.IsAdmitted(ctx, "e", "a"); !ok {
		t.Fatal("a should be admitted")
	}

	pos, total, err := q.Position(ctx, "e", "b")
	if err != nil {
		t.Fatal(err)
	}
	if pos != 1 || total != 1 {
		t.Fatalf("after admit, b should be pos1/total1, got pos=%d total=%d", pos, total)
	}
}

func TestSimulatePushesRealVisitorBack(t *testing.T) {
	q := newTestQueue(t)
	ctx := context.Background()

	if pos, _, _ := q.Join(ctx, "e", "real"); pos != 1 {
		t.Fatalf("expected front position, got %d", pos)
	}
	if _, err := q.Simulate(ctx, "e", 50); err != nil {
		t.Fatal(err)
	}
	pos, total, err := q.Position(ctx, "e", "real")
	if err != nil {
		t.Fatal(err)
	}
	if pos != 51 || total != 51 {
		t.Fatalf("expected pos 51 / total 51 after 50 bots ahead, got pos=%d total=%d", pos, total)
	}
}

func TestAdmitDrainsBotsWithoutMarkingAdmitted(t *testing.T) {
	q := newTestQueue(t)
	ctx := context.Background()

	if _, err := q.Simulate(ctx, "e", 3); err != nil {
		t.Fatal(err)
	}
	admitted, err := q.Admit(ctx, "e", 3)
	if err != nil {
		t.Fatal(err)
	}
	if admitted != 0 {
		t.Fatalf("bots should not count as admitted, got %d", admitted)
	}
}

func TestPositionUnknownVisitor(t *testing.T) {
	q := newTestQueue(t)
	if _, _, err := q.Position(context.Background(), "e", "ghost"); err != errNotQueued {
		t.Fatalf("expected errNotQueued, got %v", err)
	}
}
