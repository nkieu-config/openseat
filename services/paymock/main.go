package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

const (
	maxRequestBytes = 64 << 10
	shutdownGrace   = 10 * time.Second
)

func withResult(returnURL, status string) string {
	separator := "?"
	if strings.Contains(returnURL, "?") {
		separator = "&"
	}
	return returnURL + separator + "payment=" + status
}

type config struct {
	port              string
	apiKey            string
	webhookSecret     string
	publicURL         string
	duplicateWebhooks bool
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func requiredSecret(key, devFallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	if os.Getenv("APP_ENV") == "production" {
		log.Fatalf("%s must be set when APP_ENV=production", key)
	}
	log.Printf("%s is unset; falling back to the development default", key)
	return devFallback
}

func loadConfig() config {
	return config{
		port:              envOr("PORT", "4100"),
		apiKey:            requiredSecret("PAYMOCK_API_KEY", "paymock-dev-key"),
		webhookSecret:     requiredSecret("PAYMOCK_WEBHOOK_SECRET", "paymock-dev-webhook-secret"),
		publicURL:         envOr("PAYMOCK_PUBLIC_URL", "http://localhost:4100"),
		duplicateWebhooks: envOr("PAYMOCK_DUPLICATE_WEBHOOKS", "true") == "true",
	}
}

type createIntentRequest struct {
	OrderID      string `json:"orderId"`
	AmountSatang int64  `json:"amountSatang"`
	Currency     string `json:"currency"`
	CallbackURL  string `json:"callbackUrl"`
	ReturnURL    string `json:"returnUrl"`
}

type refundRequest struct {
	AmountSatang int64  `json:"amountSatang"`
	Reference    string `json:"reference"`
}

type server struct {
	cfg        config
	store      *store
	dispatcher *dispatcher
	mux        *http.ServeMux
}

func newServer(cfg config, st *store, dp *dispatcher) *server {
	s := &server{cfg: cfg, store: st, dispatcher: dp, mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("POST /intents", s.handleCreateIntent)
	s.mux.HandleFunc("GET /pay/{id}", s.handlePayPage)
	s.mux.HandleFunc("POST /pay/{id}/confirm", s.handleConfirm)
	s.mux.HandleFunc("POST /intents/{id}/refunds", s.handleRefund)
	return s
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
	s.mux.ServeHTTP(w, r)
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

func (s *server) handleCreateIntent(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer "+s.cfg.apiKey {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid api key"})
		return
	}
	var req createIntentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}
	if req.OrderID == "" || req.AmountSatang <= 0 || req.CallbackURL == "" || req.ReturnURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "orderId, amountSatang, callbackUrl, and returnUrl are required"})
		return
	}
	if req.Currency == "" {
		req.Currency = "THB"
	}
	intent := s.store.Create(req.OrderID, req.AmountSatang, req.Currency, req.CallbackURL, req.ReturnURL)
	writeJSON(w, http.StatusCreated, map[string]string{
		"intentId":    intent.ID,
		"checkoutUrl": s.cfg.publicURL + "/pay/" + intent.ID,
		"status":      intent.Status,
	})
}

func (s *server) handlePayPage(w http.ResponseWriter, r *http.Request) {
	intent, ok := s.store.Get(r.PathValue("id"))
	if !ok {
		http.Error(w, "payment intent not found", http.StatusNotFound)
		return
	}
	if intent.Status != statusRequiresAction {
		http.Redirect(w, r, withResult(intent.ReturnURL, intent.Status), http.StatusSeeOther)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	err := payPage.Execute(w, map[string]string{
		"IntentID": intent.ID,
		"OrderID":  intent.OrderID,
		"Amount":   formatAmount(intent.AmountSatang),
	})
	if err != nil {
		log.Printf("pay page render failed: %v", err)
	}
}

func (s *server) handleConfirm(w http.ResponseWriter, r *http.Request) {
	outcome := r.FormValue("outcome")
	status := statusSucceeded
	eventType := "payment.succeeded"
	if outcome == "fail" {
		status = statusFailed
		eventType = "payment.failed"
	}
	intent, errCode := s.store.Resolve(r.PathValue("id"), status)
	if errCode == "not_found" {
		http.Error(w, "payment intent not found", http.StatusNotFound)
		return
	}
	if errCode == "" {
		s.dispatcher.Send(intent.CallbackURL, Event{
			ID:           newID("evt_"),
			Type:         eventType,
			IntentID:     intent.ID,
			OrderID:      intent.OrderID,
			AmountSatang: intent.AmountSatang,
			CreatedAt:    time.Now().UTC(),
		})
	}
	http.Redirect(w, r, withResult(intent.ReturnURL, intent.Status), http.StatusSeeOther)
}

func (s *server) handleRefund(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer "+s.cfg.apiKey {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid api key"})
		return
	}
	var req refundRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}
	outcome, errCode := s.store.Refund(r.PathValue("id"), req.Reference, req.AmountSatang)
	switch errCode {
	case "not_found":
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "payment intent not found"})
		return
	case "invalid_amount":
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "amountSatang must be positive"})
		return
	case "not_succeeded":
		writeJSON(w, http.StatusConflict, map[string]string{"error": "intent is not succeeded"})
		return
	case "over_refund":
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "refund exceeds amount paid"})
		return
	}
	if !outcome.Duplicate {
		s.dispatcher.Send(outcome.Intent.CallbackURL, Event{
			ID:           newID("evt_"),
			Type:         "payment.refunded",
			IntentID:     outcome.Intent.ID,
			OrderID:      outcome.Intent.OrderID,
			AmountSatang: req.AmountSatang,
			RefundID:     outcome.RefundID,
			Reference:    req.Reference,
			CreatedAt:    time.Now().UTC(),
		})
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"refundId":       outcome.RefundID,
		"status":         "succeeded",
		"refundedSatang": outcome.Intent.RefundedSatang,
	})
}

func main() {
	cfg := loadConfig()
	rootCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dispatcher := newDispatcher(cfg.webhookSecret, cfg.duplicateWebhooks, defaultBackoff, log.Default())
	srv := &http.Server{
		Addr:              ":" + cfg.port,
		Handler:           newServer(cfg, newStore(), dispatcher),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	go func() {
		log.Printf("paymock listening on :%s (duplicate webhooks: %t)", cfg.port, cfg.duplicateWebhooks)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("paymock server error: %v", err)
			stop()
		}
	}()

	<-rootCtx.Done()
	stop()
	log.Print("paymock shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("paymock shutdown: %v", err)
	}
	dispatcher.Close(shutdownGrace)
}
