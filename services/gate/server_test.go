package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newTestServer(t *testing.T) (*server, *Queue) {
	t.Helper()
	queue := newTestQueue(t)
	cfg := config{
		secret:       "test-admission-secret",
		admissionTTL: time.Minute,
		admitBatch:   3,
		webOrigin:    "https://openseat.test",
	}
	return newServer(cfg, queue), queue
}

func doJSON(t *testing.T, srv *server, method, target, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	var decoded map[string]any
	if rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), &decoded)
	}
	return rec, decoded
}

func TestHandleHealthAnswersOk(t *testing.T) {
	srv, _ := newTestServer(t)

	rec, body := doJSON(t, srv, http.MethodGet, "/health", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if body["status"] != "ok" {
		t.Fatalf("status body = %v, want ok", body["status"])
	}
}

func TestHandleJoinPlacesAFreshVisitorAtTheFront(t *testing.T) {
	srv, _ := newTestServer(t)

	rec, body := doJSON(t, srv, http.MethodPost, "/gate/e/join", `{"visitorId":"v:1"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if body["admitted"] != false {
		t.Fatalf("admitted = %v, want false", body["admitted"])
	}
	if body["position"] != float64(1) || body["total"] != float64(1) {
		t.Fatalf("position/total = %v/%v, want 1/1", body["position"], body["total"])
	}
}

func TestHandleJoinReturnsATokenToAnAlreadyAdmittedVisitor(t *testing.T) {
	srv, queue := newTestServer(t)
	ctx := context.Background()
	if _, _, err := queue.Join(ctx, "e", "v:1"); err != nil {
		t.Fatal(err)
	}
	if _, err := queue.Admit(ctx, "e", 1); err != nil {
		t.Fatal(err)
	}

	rec, body := doJSON(t, srv, http.MethodPost, "/gate/e/join", `{"visitorId":"v:1"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if body["admitted"] != true {
		t.Fatalf("admitted = %v, want true", body["admitted"])
	}
	token, ok := body["token"].(string)
	if !ok || strings.Count(token, ".") != 2 {
		t.Fatalf("token = %v, want a three-part JWT", body["token"])
	}
}

func TestHandleJoinRejectsAKeySeparatorInTheEventID(t *testing.T) {
	srv, _ := newTestServer(t)

	rec, _ := doJSON(t, srv, http.MethodPost, "/gate/bad:id/join", `{"visitorId":"v:1"}`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHandleJoinRejectsAControlCharInTheVisitorID(t *testing.T) {
	srv, _ := newTestServer(t)

	rec, _ := doJSON(t, srv, http.MethodPost, "/gate/e/join", `{"visitorId":"v\u0001x"}`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHandleSimulateClampsTheCount(t *testing.T) {
	srv, _ := newTestServer(t)

	_, missing := doJSON(t, srv, http.MethodPost, "/gate/floor/simulate", `{"count":0}`)
	if missing["added"] != float64(200) {
		t.Fatalf("added = %v for count 0, want the 200 default", missing["added"])
	}

	_, absurd := doJSON(t, srv, http.MethodPost, "/gate/ceil/simulate", `{"count":5000}`)
	if absurd["added"] != float64(1000) {
		t.Fatalf("added = %v for count 5000, want the 1000 ceiling", absurd["added"])
	}
}

func TestPreflightReturns204WithCORSHeaders(t *testing.T) {
	srv, _ := newTestServer(t)

	req := httptest.NewRequest(http.MethodOptions, "/gate/e/join", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://openseat.test" {
		t.Fatalf("allow-origin = %q, want the configured web origin", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got != "GET, POST, OPTIONS" {
		t.Fatalf("allow-methods = %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got != "Content-Type, traceparent" {
		t.Fatalf("allow-headers = %q", got)
	}
}

func TestUnknownPathIs404(t *testing.T) {
	srv, _ := newTestServer(t)

	rec, _ := doJSON(t, srv, http.MethodGet, "/does-not-exist", "")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}
