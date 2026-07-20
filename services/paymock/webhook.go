package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"
)

type Event struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"`
	IntentID     string    `json:"intentId"`
	OrderID      string    `json:"orderId"`
	AmountSatang int64     `json:"amountSatang"`
	RefundID     string    `json:"refundId,omitempty"`
	Reference    string    `json:"reference,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
}

var defaultBackoff = []time.Duration{
	time.Second,
	5 * time.Second,
	25 * time.Second,
	2 * time.Minute,
	10 * time.Minute,
	10 * time.Minute,
	10 * time.Minute,
	10 * time.Minute,
}

type dispatcher struct {
	secret    string
	duplicate bool
	backoff   []time.Duration
	client    *http.Client
	logger    *log.Logger
	now       func() time.Time
	quit      chan struct{}
	mu        sync.Mutex
	closed    bool
	inFlight  sync.WaitGroup
}

func newDispatcher(secret string, duplicate bool, backoff []time.Duration, logger *log.Logger) *dispatcher {
	return &dispatcher{
		secret:    secret,
		duplicate: duplicate,
		backoff:   backoff,
		client:    &http.Client{Timeout: 15 * time.Second},
		logger:    logger,
		now:       time.Now,
		quit:      make(chan struct{}),
	}
}

func (d *dispatcher) Send(callbackURL string, event Event) {
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return
	}
	d.inFlight.Add(1)
	d.mu.Unlock()
	go func() {
		defer d.inFlight.Done()
		d.Deliver(callbackURL, event)
	}()
}

func (d *dispatcher) wait(delay time.Duration) bool {
	if delay <= 0 {
		return true
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-d.quit:
		return false
	case <-timer.C:
		return true
	}
}

func (d *dispatcher) Close(timeout time.Duration) {
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return
	}
	d.closed = true
	close(d.quit)
	d.mu.Unlock()
	drained := make(chan struct{})
	go func() {
		d.inFlight.Wait()
		close(drained)
	}()
	select {
	case <-drained:
	case <-time.After(timeout):
		d.logger.Print("webhook dispatcher: in-flight deliveries did not drain in time")
	}
}

func (d *dispatcher) Deliver(callbackURL string, event Event) int {
	body, err := json.Marshal(event)
	if err != nil {
		d.logger.Printf("webhook %s: marshal failed: %v", event.ID, err)
		return 0
	}
	deliveries := 0
	delivered := false
	for attempt := 0; attempt <= len(d.backoff); attempt++ {
		if d.deliverOnce(callbackURL, body) {
			deliveries++
			delivered = true
			break
		}
		if attempt < len(d.backoff) && !d.wait(d.backoff[attempt]) {
			d.logger.Printf("webhook %s: abandoned after %d attempts on shutdown", event.ID, attempt+1)
			return deliveries
		}
	}
	if !delivered {
		d.logger.Printf("webhook %s: gave up after %d attempts", event.ID, len(d.backoff)+1)
		return deliveries
	}
	if d.duplicate {
		if d.deliverOnce(callbackURL, body) {
			deliveries++
		}
	}
	return deliveries
}

func (d *dispatcher) deliverOnce(callbackURL string, body []byte) bool {
	req, err := http.NewRequest(http.MethodPost, callbackURL, bytes.NewReader(body))
	if err != nil {
		d.logger.Printf("webhook request build failed: %v", err)
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-PayMock-Signature", SignatureHeader(d.secret, d.now().Unix(), body))
	resp, err := d.client.Do(req)
	if err != nil {
		d.logger.Printf("webhook delivery failed: %v", err)
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}
