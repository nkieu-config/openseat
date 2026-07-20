package main

import (
	"context"
	"testing"

	"github.com/redis/go-redis/v9"
)

func TestValidEventIDRejectsKeySeparators(t *testing.T) {
	cases := map[string]bool{
		"11111111-2222-3333-4444-555555555555": true,
		"evt_1":     true,
		"E:adm:bot": false,
		"a:b":       false,
		"a b":       false,
		"a/b":       false,
		"":          false,
	}
	for id, want := range cases {
		if got := validEventID(id); got != want {
			t.Errorf("validEventID(%q) = %v, want %v", id, got, want)
		}
	}
}

func TestIsAdmittedIgnoresCollidingWrongTypeKey(t *testing.T) {
	q := newTestQueue(t)
	ctx := context.Background()

	real := "11111111-2222-3333-4444-555555555555"
	visitor := "bot:q"
	if queueKey(real+":adm:bot") != admitKey(real, visitor) {
		t.Fatalf("precondition: expected the historic key collision to hold")
	}

	if err := q.rdb.ZAdd(ctx, admitKey(real, visitor), redis.Z{Score: 1, Member: "x"}).Err(); err != nil {
		t.Fatal(err)
	}

	admitted, _ := q.IsAdmitted(ctx, real, visitor)
	if admitted {
		t.Fatal("a planted wrong-type key must not count as an admission")
	}
}

func TestIsAdmittedAcceptsRealMarker(t *testing.T) {
	q := newTestQueue(t)
	ctx := context.Background()

	if err := q.rdb.Set(ctx, admitKey("evt", "v:1"), admittedMarker, 0).Err(); err != nil {
		t.Fatal(err)
	}
	admitted, err := q.IsAdmitted(ctx, "evt", "v:1")
	if err != nil {
		t.Fatal(err)
	}
	if !admitted {
		t.Fatal("a real admission marker must count as admitted")
	}
}
