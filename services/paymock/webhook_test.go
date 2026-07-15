package main

import (
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func testDispatcher(duplicate bool, backoff []time.Duration) *dispatcher {
	d := newDispatcher("test-secret", duplicate, backoff, log.New(io.Discard, "", 0))
	d.sleep = func(time.Duration) {}
	return d
}

func testEvent() Event {
	return Event{ID: "evt_test", Type: "payment.succeeded", IntentID: "pi_test", OrderID: "order_test", AmountSatang: 90000, CreatedAt: time.Unix(1700000000, 0)}
}

func TestDeliverRetriesUntilSuccess(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) <= 2 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	deliveries := testDispatcher(false, []time.Duration{0, 0, 0}).Deliver(srv.URL, testEvent())

	if deliveries != 1 {
		t.Errorf("deliveries = %d, want 1", deliveries)
	}
	if calls.Load() != 3 {
		t.Errorf("attempts = %d, want 3", calls.Load())
	}
}

func TestDeliverGivesUpAfterBackoffExhausted(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	deliveries := testDispatcher(false, []time.Duration{0, 0}).Deliver(srv.URL, testEvent())

	if deliveries != 0 {
		t.Errorf("deliveries = %d, want 0", deliveries)
	}
	if calls.Load() != 3 {
		t.Errorf("attempts = %d, want 3 (initial + 2 retries)", calls.Load())
	}
}

func TestDeliverSendsDuplicateForIdempotencyExercise(t *testing.T) {
	var calls atomic.Int32
	var lastSignature atomic.Value
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		lastSignature.Store(r.Header.Get("X-PayMock-Signature"))
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	deliveries := testDispatcher(true, []time.Duration{0}).Deliver(srv.URL, testEvent())

	if deliveries != 2 {
		t.Errorf("deliveries = %d, want 2 (original + duplicate)", deliveries)
	}
	if calls.Load() != 2 {
		t.Errorf("attempts = %d, want 2", calls.Load())
	}
	signature, _ := lastSignature.Load().(string)
	if signature == "" {
		t.Error("expected X-PayMock-Signature header on deliveries")
	}
}
