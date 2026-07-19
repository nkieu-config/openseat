package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestStoreRefundTransitions(t *testing.T) {
	cases := []struct {
		name      string
		status    string
		paid      int64
		already   int64
		amount    int64
		wantErr   string
		wantTotal int64
	}{
		{name: "refunds a succeeded intent", status: statusSucceeded, paid: 240000, amount: 150000, wantErr: "", wantTotal: 150000},
		{name: "accumulates partial refunds", status: statusSucceeded, paid: 240000, already: 150000, amount: 90000, wantErr: "", wantTotal: 240000},
		{name: "rejects an unpaid intent", status: statusRequiresAction, paid: 240000, amount: 90000, wantErr: "not_succeeded"},
		{name: "rejects a failed intent", status: statusFailed, paid: 240000, amount: 90000, wantErr: "not_succeeded"},
		{name: "rejects over-refund", status: statusSucceeded, paid: 240000, already: 200000, amount: 90000, wantErr: "over_refund"},
		{name: "rejects a non-positive amount", status: statusSucceeded, paid: 240000, amount: 0, wantErr: "invalid_amount"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			st := newStore()
			intent := st.Create("order_1", tc.paid, "THB", "http://cb", "http://ret")
			if tc.status != statusRequiresAction {
				st.Resolve(intent.ID, tc.status)
			}
			if tc.already > 0 {
				st.Refund(intent.ID, "", tc.already)
			}
			got, errCode := st.Refund(intent.ID, "", tc.amount)
			if errCode != tc.wantErr {
				t.Fatalf("errCode = %q, want %q", errCode, tc.wantErr)
			}
			if tc.wantErr == "" && got.Intent.RefundedSatang != tc.wantTotal {
				t.Errorf("RefundedSatang = %d, want %d", got.Intent.RefundedSatang, tc.wantTotal)
			}
			if tc.wantErr != "" {
				current, _ := st.Get(intent.ID)
				if current.RefundedSatang != tc.already {
					t.Errorf("RefundedSatang moved to %d on a rejected refund, want %d", current.RefundedSatang, tc.already)
				}
			}
		})
	}
}

func TestStoreRefundUnknownIntent(t *testing.T) {
	if _, errCode := newStore().Refund("pi_missing", "", 100); errCode != "not_found" {
		t.Errorf("errCode = %q, want not_found", errCode)
	}
}

func TestStoreRefundDedupesByReference(t *testing.T) {
	st := newStore()
	intent := st.Create("order_1", 240000, "THB", "http://cb", "http://ret")
	st.Resolve(intent.ID, statusSucceeded)

	first, errCode := st.Refund(intent.ID, "rf_1", 90000)
	if errCode != "" {
		t.Fatalf("first refund errCode = %q, want none", errCode)
	}
	replay, errCode := st.Refund(intent.ID, "rf_1", 90000)
	if errCode != "" {
		t.Fatalf("replayed refund errCode = %q, want none", errCode)
	}
	if !replay.Duplicate {
		t.Error("replayed refund was treated as new money movement")
	}
	if replay.RefundID != first.RefundID {
		t.Errorf("replayed refundId = %q, want the original %q", replay.RefundID, first.RefundID)
	}
	if replay.Intent.RefundedSatang != 90000 {
		t.Errorf("RefundedSatang = %d, want 90000 — the replay moved money twice", replay.Intent.RefundedSatang)
	}

	other, errCode := st.Refund(intent.ID, "rf_2", 90000)
	if errCode != "" {
		t.Fatalf("second distinct refund errCode = %q, want none", errCode)
	}
	if other.Duplicate || other.RefundID == first.RefundID {
		t.Error("a distinct reference was deduped against the first refund")
	}
	if other.Intent.RefundedSatang != 180000 {
		t.Errorf("RefundedSatang = %d, want 180000", other.Intent.RefundedSatang)
	}
}

func TestHandleRefundReplayDoesNotDispatchAgain(t *testing.T) {
	events := make(chan Event, 4)
	callback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var event Event
		if err := json.NewDecoder(r.Body).Decode(&event); err == nil {
			events <- event
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer callback.Close()

	cfg := loadConfig()
	st := newStore()
	srv := newServer(cfg, st, testDispatcher(false, []time.Duration{0}))
	intent := st.Create("order_1", 240000, "THB", callback.URL, "http://ret")
	st.Resolve(intent.ID, statusSucceeded)

	post := func() map[string]any {
		req := httptest.NewRequest(http.MethodPost, "/intents/"+intent.ID+"/refunds",
			strings.NewReader(`{"amountSatang":150000,"reference":"rf_replay"}`))
		req.Header.Set("Authorization", "Bearer "+cfg.apiKey)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
		}
		var body map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("bad response json: %v", err)
		}
		return body
	}

	first := post()
	replay := post()
	if first["refundId"] != replay["refundId"] {
		t.Errorf("replay refundId = %v, want the original %v", replay["refundId"], first["refundId"])
	}
	if replay["refundedSatang"] != float64(150000) {
		t.Errorf("refundedSatang = %v, want 150000", replay["refundedSatang"])
	}

	select {
	case <-events:
	case <-time.After(2 * time.Second):
		t.Fatal("expected the first refund to dispatch a webhook")
	}
	select {
	case event := <-events:
		t.Errorf("replay dispatched a second settlement webhook: %+v", event)
	case <-time.After(300 * time.Millisecond):
	}
}

func TestStoreSurvivesConcurrentReadersAndWriters(t *testing.T) {
	st := newStore()
	intent := st.Create("order_1", 240000, "THB", "http://cb", "http://ret")
	st.Resolve(intent.ID, statusSucceeded)

	var wg sync.WaitGroup
	for worker := 0; worker < 48; worker++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			switch worker % 3 {
			case 0:
				got, _ := st.Get(intent.ID)
				_ = got.Status + got.Currency
			case 1:
				out, _ := st.Refund(intent.ID, "", 1000)
				_ = out.Intent.RefundedSatang
			default:
				out, _ := st.Resolve(intent.ID, statusSucceeded)
				_ = out.Status
			}
		}(worker)
	}
	wg.Wait()

	final, ok := st.Get(intent.ID)
	if !ok {
		t.Fatal("intent vanished under concurrency")
	}
	if final.RefundedSatang > final.AmountSatang {
		t.Errorf("refunded %d exceeds the %d paid", final.RefundedSatang, final.AmountSatang)
	}
	if final.Status != statusSucceeded {
		t.Errorf("status = %q, want %q", final.Status, statusSucceeded)
	}
}

func TestHandleRefundDispatchesRefundedEvent(t *testing.T) {
	events := make(chan Event, 2)
	callback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var event Event
		if err := json.NewDecoder(r.Body).Decode(&event); err == nil {
			events <- event
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer callback.Close()

	cfg := loadConfig()
	st := newStore()
	srv := newServer(cfg, st, testDispatcher(true, []time.Duration{0}))
	intent := st.Create("order_1", 240000, "THB", callback.URL, "http://ret")
	st.Resolve(intent.ID, statusSucceeded)

	req := httptest.NewRequest(http.MethodPost, "/intents/"+intent.ID+"/refunds",
		strings.NewReader(`{"amountSatang":150000,"reference":"rf_test_1"}`))
	req.Header.Set("Authorization", "Bearer "+cfg.apiKey)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("bad response json: %v", err)
	}
	refundID, _ := body["refundId"].(string)
	if !strings.HasPrefix(refundID, "re_") {
		t.Errorf("refundId = %q, want re_ prefix", refundID)
	}
	for i := 0; i < 2; i++ {
		select {
		case event := <-events:
			if event.Type != "payment.refunded" {
				t.Errorf("event type = %q, want payment.refunded", event.Type)
			}
			if event.AmountSatang != 150000 {
				t.Errorf("event amount = %d, want the refund amount 150000", event.AmountSatang)
			}
			if event.RefundID != refundID {
				t.Errorf("event refundId = %q, want %q", event.RefundID, refundID)
			}
			if event.Reference != "rf_test_1" {
				t.Errorf("event reference = %q, want rf_test_1 echoed back", event.Reference)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("expected 2 webhook deliveries (double-send), got %d", i)
		}
	}
}

func TestHandleRefundRejectsBadKeyAndBadStates(t *testing.T) {
	cfg := loadConfig()
	st := newStore()
	srv := newServer(cfg, st, testDispatcher(false, []time.Duration{0}))
	paid := st.Create("order_1", 240000, "THB", "http://cb.invalid", "http://ret")
	st.Resolve(paid.ID, statusSucceeded)
	pending := st.Create("order_2", 240000, "THB", "http://cb.invalid", "http://ret")

	cases := []struct {
		name   string
		id     string
		key    string
		body   string
		status int
	}{
		{name: "bad api key", id: paid.ID, key: "wrong", body: `{"amountSatang":100}`, status: http.StatusUnauthorized},
		{name: "unknown intent", id: "pi_missing", key: cfg.apiKey, body: `{"amountSatang":100}`, status: http.StatusNotFound},
		{name: "not succeeded", id: pending.ID, key: cfg.apiKey, body: `{"amountSatang":100}`, status: http.StatusConflict},
		{name: "over refund", id: paid.ID, key: cfg.apiKey, body: `{"amountSatang":999999}`, status: http.StatusUnprocessableEntity},
		{name: "bad body", id: paid.ID, key: cfg.apiKey, body: `nope`, status: http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/intents/"+tc.id+"/refunds", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer "+tc.key)
			rec := httptest.NewRecorder()
			srv.ServeHTTP(rec, req)
			if rec.Code != tc.status {
				t.Errorf("status = %d, want %d: %s", rec.Code, tc.status, rec.Body.String())
			}
		})
	}
}
