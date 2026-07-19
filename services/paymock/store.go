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
	mu           sync.RWMutex
	intents      map[string]*Intent
	refundsByRef map[string]string
}

type refundOutcome struct {
	Intent    Intent
	RefundID  string
	Duplicate bool
}

func newStore() *store {
	return &store{
		intents:      make(map[string]*Intent),
		refundsByRef: make(map[string]string),
	}
}

func newID(prefix string) string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return prefix + hex.EncodeToString(buf)
}

func (s *store) Create(orderID string, amountSatang int64, currency, callbackURL, returnURL string) Intent {
	intent := &Intent{
		ID:           newID("pi_"),
		OrderID:      orderID,
		AmountSatang: amountSatang,
		Currency:     currency,
		CallbackURL:  callbackURL,
		ReturnURL:    returnURL,
		Status:       statusRequiresAction,
		CreatedAt:    time.Now().UTC(),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.intents[intent.ID] = intent
	return *intent
}

func (s *store) Get(id string) (Intent, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	intent, ok := s.intents[id]
	if !ok {
		return Intent{}, false
	}
	return *intent, true
}

func (s *store) Resolve(id, status string) (Intent, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	intent, ok := s.intents[id]
	if !ok {
		return Intent{}, "not_found"
	}
	if intent.Status != statusRequiresAction {
		return *intent, "already_resolved"
	}
	intent.Status = status
	return *intent, ""
}

func (s *store) Refund(id, reference string, amountSatang int64) (refundOutcome, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	intent, ok := s.intents[id]
	if !ok {
		return refundOutcome{}, "not_found"
	}
	if reference != "" {
		if refundID, seen := s.refundsByRef[reference]; seen {
			return refundOutcome{Intent: *intent, RefundID: refundID, Duplicate: true}, ""
		}
	}
	if amountSatang <= 0 {
		return refundOutcome{Intent: *intent}, "invalid_amount"
	}
	if intent.Status != statusSucceeded {
		return refundOutcome{Intent: *intent}, "not_succeeded"
	}
	if intent.RefundedSatang+amountSatang > intent.AmountSatang {
		return refundOutcome{Intent: *intent}, "over_refund"
	}
	intent.RefundedSatang += amountSatang
	refundID := newID("re_")
	if reference != "" {
		s.refundsByRef[reference] = refundID
	}
	return refundOutcome{Intent: *intent, RefundID: refundID}, ""
}
