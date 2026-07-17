package main

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

const (
	statusRequiresAction = "requires_action"
	statusSucceeded      = "succeeded"
	statusFailed         = "failed"
)

type Intent struct {
	ID             string
	OrderID        string
	AmountSatang   int64
	Currency       string
	CallbackURL    string
	ReturnURL      string
	Status         string
	RefundedSatang int64
	CreatedAt      time.Time
}

type store struct {
	mu      sync.RWMutex
	intents map[string]*Intent
}

func newStore() *store {
	return &store{intents: make(map[string]*Intent)}
}

func newID(prefix string) string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return prefix + hex.EncodeToString(buf)
}

func (s *store) Create(orderID string, amountSatang int64, currency, callbackURL, returnURL string) *Intent {
	intent := &Intent{
		ID:           newID("pi_"),
		OrderID:      orderID,
		AmountSatang: amountSatang,
		Currency:     currency,
		CallbackURL:  callbackURL,
		ReturnURL:    returnURL,
		Status:       statusRequiresAction,
		CreatedAt:    time.Now(),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.intents[intent.ID] = intent
	return intent
}

func (s *store) Get(id string) (*Intent, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	intent, ok := s.intents[id]
	return intent, ok
}

func (s *store) Resolve(id, status string) (*Intent, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	intent, ok := s.intents[id]
	if !ok || intent.Status != statusRequiresAction {
		return intent, false
	}
	intent.Status = status
	return intent, true
}

func (s *store) Refund(id string, amountSatang int64) (*Intent, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	intent, ok := s.intents[id]
	if !ok {
		return nil, "not_found"
	}
	if amountSatang <= 0 {
		return intent, "invalid_amount"
	}
	if intent.Status != statusSucceeded {
		return intent, "not_succeeded"
	}
	if intent.RefundedSatang+amountSatang > intent.AmountSatang {
		return intent, "over_refund"
	}
	intent.RefundedSatang += amountSatang
	return intent, ""
}
