package main

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func readFrame(t *testing.T, r *bufio.Reader) string {
	t.Helper()
	var frame strings.Builder
	for {
		line, err := r.ReadString('\n')
		frame.WriteString(line)
		if err != nil {
			return frame.String()
		}
		if line == "\n" {
			return frame.String()
		}
	}
}

func openStream(t *testing.T, ctx context.Context, url string) *http.Response {
	t.Helper()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("stream request: %v", err)
	}
	return resp
}

func TestStreamEmitsAPositionFrameForAQueuedVisitor(t *testing.T) {
	srv, queue := newTestServer(t)
	ts := httptest.NewServer(srv)
	defer ts.Close()
	if _, _, err := queue.Join(context.Background(), "e", "v:1"); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp := openStream(t, ctx, ts.URL+"/gate/e/queue?visitor=v:1")
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content-type = %q, want text/event-stream", ct)
	}
	frame := readFrame(t, bufio.NewReader(resp.Body))
	if !strings.Contains(frame, "event: position") {
		t.Fatalf("first frame = %q, want a position event", frame)
	}
	if !strings.Contains(frame, `"ahead":0`) {
		t.Fatalf("first frame = %q, want ahead 0 for the front of the queue", frame)
	}
}

func TestStreamHandsAnAdmittedVisitorATokenAndEnds(t *testing.T) {
	srv, queue := newTestServer(t)
	ts := httptest.NewServer(srv)
	defer ts.Close()
	ctx := context.Background()
	if _, _, err := queue.Join(ctx, "e", "v:1"); err != nil {
		t.Fatal(err)
	}
	if _, err := queue.Admit(ctx, "e", 1); err != nil {
		t.Fatal(err)
	}

	reqCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp := openStream(t, reqCtx, ts.URL+"/gate/e/queue?visitor=v:1")
	defer resp.Body.Close()

	reader := bufio.NewReader(resp.Body)
	frame := readFrame(t, reader)
	if !strings.Contains(frame, "event: admitted") || !strings.Contains(frame, "token") {
		t.Fatalf("first frame = %q, want an admitted event carrying a token", frame)
	}
	if tail := readFrame(t, reader); tail != "" {
		t.Fatalf("expected the stream to end after admission, got another frame %q", tail)
	}
}

func TestStreamTellsAnUnknownVisitorItExpiredAndEnds(t *testing.T) {
	srv, _ := newTestServer(t)
	ts := httptest.NewServer(srv)
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp := openStream(t, ctx, ts.URL+"/gate/e/queue?visitor=v:ghost")
	defer resp.Body.Close()

	reader := bufio.NewReader(resp.Body)
	frame := readFrame(t, reader)
	if !strings.Contains(frame, "event: expired") {
		t.Fatalf("first frame = %q, want an expired event", frame)
	}
	if tail := readFrame(t, reader); tail != "" {
		t.Fatalf("expected the stream to end after expiry, got another frame %q", tail)
	}
}

func TestStreamRefusesAMissingVisitorParam(t *testing.T) {
	srv, _ := newTestServer(t)
	ts := httptest.NewServer(srv)
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp := openStream(t, ctx, ts.URL+"/gate/e/queue")
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 before any streaming", resp.StatusCode)
	}
}
