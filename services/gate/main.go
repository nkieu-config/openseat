package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

type config struct {
	port          string
	redisURL      string
	secret        string
	admissionTTL  time.Duration
	admitBatch    int
	admitInterval time.Duration
	admitEnabled  bool
	webOrigin     string
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func atoiOr(value string, fallback int) int {
	if parsed, err := strconv.Atoi(value); err == nil {
		return parsed
	}
	return fallback
}

func loadConfig() config {
	return config{
		port:          envOr("PORT", "4200"),
		redisURL:      envOr("REDIS_URL", "redis://localhost:6379"),
		secret:        envOr("GATE_ADMISSION_SECRET", "gate-dev-admission-secret"),
		admissionTTL:  time.Duration(atoiOr(envOr("ADMISSION_TTL_SECONDS", ""), 300)) * time.Second,
		admitBatch:    atoiOr(envOr("ADMIT_BATCH", ""), 3),
		admitInterval: time.Duration(atoiOr(envOr("ADMIT_INTERVAL_MS", ""), 2000)) * time.Millisecond,
		admitEnabled:  envOr("ADMIT_ENABLED", "true") == "true",
		webOrigin:     envOr("WEB_ORIGIN", "*"),
	}
}

func randomID() string {
	raw := make([]byte, 12)
	_, _ = rand.Read(raw)
	return hex.EncodeToString(raw)
}

func mustJSON(value any) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

type server struct {
	cfg     config
	queue   *Queue
	mux     *http.ServeMux
	handler http.Handler
}

func newServer(cfg config, queue *Queue) *server {
	s := &server{cfg: cfg, queue: queue, mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("POST /gate/{eventId}/join", s.handleJoin)
	s.mux.HandleFunc("GET /gate/{eventId}/queue", s.handleStream)
	s.mux.HandleFunc("POST /gate/{eventId}/simulate", s.handleSimulate)
	s.handler = otelhttp.NewHandler(s.mux, "gate")
	return s
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", s.cfg.webOrigin)
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, traceparent")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.handler.ServeHTTP(w, r)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("response encode failed: %v", err)
	}
}

func (s *server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type joinRequest struct {
	VisitorID string `json:"visitorId"`
}

func (s *server) handleJoin(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("eventId")
	var req joinRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	visitor := req.VisitorID
	if visitor == "" {
		visitor = "v:" + randomID()
	}
	ctx := r.Context()

	if admitted, _ := s.queue.IsAdmitted(ctx, eventID, visitor); admitted {
		writeJSON(w, http.StatusOK, map[string]any{
			"visitorId": visitor,
			"admitted":  true,
			"token":     signAdmission(s.cfg.secret, visitor, eventID, time.Now(), s.cfg.admissionTTL),
		})
		return
	}
	position, total, err := s.queue.Join(ctx, eventID, visitor)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "queue unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"visitorId": visitor,
		"admitted":  false,
		"position":  position,
		"total":     total,
	})
}

type simulateRequest struct {
	Count int `json:"count"`
}

func (s *server) handleSimulate(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("eventId")
	var req simulateRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Count <= 0 {
		req.Count = 200
	}
	if req.Count > 1000 {
		req.Count = 1000
	}
	total, err := s.queue.Simulate(r.Context(), eventID, req.Count)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "queue unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"added": req.Count, "total": total})
}

func (s *server) handleStream(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("eventId")
	visitor := r.URL.Query().Get("visitor")
	if visitor == "" {
		http.Error(w, "visitor query param required", http.StatusBadRequest)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	sseConnections.Add(r.Context(), 1)
	defer sseConnections.Add(context.Background(), -1)

	ctx := r.Context()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	tick := func() bool {
		if admitted, err := s.queue.IsAdmitted(ctx, eventID, visitor); err == nil && admitted {
			token := signAdmission(s.cfg.secret, visitor, eventID, time.Now(), s.cfg.admissionTTL)
			fmt.Fprintf(w, "event: admitted\ndata: %s\n\n", mustJSON(map[string]string{"token": token}))
			flusher.Flush()
			return false
		}
		position, total, err := s.queue.Position(ctx, eventID, visitor)
		if errors.Is(err, errNotQueued) {
			fmt.Fprint(w, "event: expired\ndata: {}\n\n")
			flusher.Flush()
			return false
		}
		if err != nil {
			return true
		}
		fmt.Fprintf(w, "event: position\ndata: %s\n\n", mustJSON(map[string]any{
			"position": position,
			"total":    total,
			"ahead":    position - 1,
		}))
		flusher.Flush()
		return true
	}

	if !tick() {
		return
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !tick() {
				return
			}
		}
	}
}

func main() {
	cfg := loadConfig()
	opts, err := redis.ParseURL(cfg.redisURL)
	if err != nil {
		log.Fatalf("invalid REDIS_URL: %v", err)
	}
	rdb := redis.NewClient(opts)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("redis unreachable: %v", err)
	}
	shutdownTelemetry := setupTelemetry(context.Background())
	defer func() { _ = shutdownTelemetry(context.Background()) }()
	queue := newQueue(rdb, cfg.admissionTTL)
	registerQueueDepthGauge(queue)
	if cfg.admitEnabled {
		go newAdmitter(queue, cfg.admitBatch, cfg.admitInterval, log.Default()).Run(context.Background())
	}
	srv := newServer(cfg, queue)
	log.Printf("gate listening on :%s (admit %d every %s)", cfg.port, cfg.admitBatch, cfg.admitInterval)
	log.Fatal(http.ListenAndServe(":"+cfg.port, srv))
}
