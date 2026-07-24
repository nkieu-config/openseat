package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type paymentHarness struct {
	srv         *server
	store       *store
	cfg         config
	callbackURL string
	events      chan Event
}

func newPaymentHarness(t *testing.T) *paymentHarness {
	t.Helper()
	events := make(chan Event, 8)
	callback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var event Event
		if err := json.NewDecoder(r.Body).Decode(&event); err == nil {
			events <- event
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(callback.Close)

	cfg := loadConfig()
	st := newStore()
	return &paymentHarness{
		srv:         newServer(cfg, st, testDispatcher(false, []time.Duration{0})),
		store:       st,
		cfg:         cfg,
		callbackURL: callback.URL,
		events:      events,
	}
}

func (h *paymentHarness) do(req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.srv.ServeHTTP(rec, req)
	return rec
}

func (h *paymentHarness) createIntent(key, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/intents", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+key)
	return h.do(req)
}

func (h *paymentHarness) confirm(id, outcome string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/pay/"+id+"/confirm", strings.NewReader("outcome="+outcome))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return h.do(req)
}

func (h *paymentHarness) seedIntent(returnURL string) Intent {
	return h.store.Create("order_1", 90000, "THB", h.callbackURL, returnURL)
}

func expectEvent(t *testing.T, events chan Event) Event {
	t.Helper()
	select {
	case event := <-events:
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("expected a webhook, none arrived")
		return Event{}
	}
}

func expectNoFurtherEvent(t *testing.T, events chan Event) {
	t.Helper()
	select {
	case event := <-events:
		t.Fatalf("unexpected extra webhook: %+v", event)
	case <-time.After(300 * time.Millisecond):
	}
}

func TestHealthAnswersOk(t *testing.T) {
	h := newPaymentHarness(t)

	rec := h.do(httptest.NewRequest(http.MethodGet, "/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("bad response json: %v", err)
	}
	if body["status"] != "ok" {
		t.Fatalf("status = %q, want ok", body["status"])
	}
}

func TestCreateIntentRejectsAWrongApiKey(t *testing.T) {
	h := newPaymentHarness(t)

	rec := h.createIntent("not-the-key", `{"orderId":"o1","amountSatang":100,"callbackUrl":"http://cb","returnUrl":"http://ret"}`)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestCreateIntentRejectsMalformedJSON(t *testing.T) {
	h := newPaymentHarness(t)

	rec := h.createIntent(h.cfg.apiKey, `{not json`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestCreateIntentRequiresTheOrderFields(t *testing.T) {
	h := newPaymentHarness(t)
	cases := map[string]string{
		"no order id":     `{"amountSatang":100,"callbackUrl":"http://cb","returnUrl":"http://ret"}`,
		"zero amount":     `{"orderId":"o1","amountSatang":0,"callbackUrl":"http://cb","returnUrl":"http://ret"}`,
		"negative amount": `{"orderId":"o1","amountSatang":-5,"callbackUrl":"http://cb","returnUrl":"http://ret"}`,
		"no callback":     `{"orderId":"o1","amountSatang":100,"returnUrl":"http://ret"}`,
		"no return url":   `{"orderId":"o1","amountSatang":100,"callbackUrl":"http://cb"}`,
	}

	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			if rec := h.createIntent(h.cfg.apiKey, body); rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", rec.Code)
			}
		})
	}
}

func TestCreateIntentReturnsACheckoutUrlForThatIntent(t *testing.T) {
	h := newPaymentHarness(t)

	rec := h.createIntent(h.cfg.apiKey, `{"orderId":"o1","amountSatang":90000,"currency":"THB","callbackUrl":"http://cb","returnUrl":"http://ret"}`)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("bad response json: %v", err)
	}
	if !strings.HasPrefix(body["intentId"], "pi_") {
		t.Fatalf("intentId = %q, want a pi_ prefix", body["intentId"])
	}
	if want := h.cfg.publicURL + "/pay/" + body["intentId"]; body["checkoutUrl"] != want {
		t.Fatalf("checkoutUrl = %q, want %q", body["checkoutUrl"], want)
	}
	if body["status"] != statusRequiresAction {
		t.Fatalf("status = %q, want %q", body["status"], statusRequiresAction)
	}
}

func TestCreateIntentDefaultsCurrencyToBaht(t *testing.T) {
	h := newPaymentHarness(t)

	rec := h.createIntent(h.cfg.apiKey, `{"orderId":"o1","amountSatang":100,"callbackUrl":"http://cb","returnUrl":"http://ret"}`)

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("bad response json: %v", err)
	}
	intent, ok := h.store.Get(body["intentId"])
	if !ok {
		t.Fatal("intent was not stored")
	}
	if intent.Currency != "THB" {
		t.Fatalf("currency = %q, want THB", intent.Currency)
	}
}

func TestPayPageIsNotFoundForAnUnknownIntent(t *testing.T) {
	h := newPaymentHarness(t)

	rec := h.do(httptest.NewRequest(http.MethodGet, "/pay/pi_nope", nil))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestPayPageShowsTheAmountAwaitingConfirmation(t *testing.T) {
	h := newPaymentHarness(t)
	intent := h.seedIntent("http://ret")

	rec := h.do(httptest.NewRequest(http.MethodGet, "/pay/"+intent.ID, nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, formatAmount(intent.AmountSatang)) {
		t.Fatalf("pay page does not show the amount %s", formatAmount(intent.AmountSatang))
	}
	if !strings.Contains(body, intent.OrderID) {
		t.Fatalf("pay page does not name order %s", intent.OrderID)
	}
}

func TestPayPageSendsAResolvedIntentStraightBack(t *testing.T) {
	h := newPaymentHarness(t)
	intent := h.seedIntent("http://ret")
	h.store.Resolve(intent.ID, statusSucceeded)

	rec := h.do(httptest.NewRequest(http.MethodGet, "/pay/"+intent.ID, nil))

	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status = %d, want 303", rec.Code)
	}
	if location := rec.Header().Get("Location"); !strings.Contains(location, "payment="+statusSucceeded) {
		t.Fatalf("location = %q, want the succeeded result", location)
	}
}

func TestConfirmDispatchesPaymentSucceededExactlyOnce(t *testing.T) {
	h := newPaymentHarness(t)
	intent := h.seedIntent("http://ret")

	rec := h.confirm(intent.ID, "")

	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status = %d, want 303", rec.Code)
	}
	if location := rec.Header().Get("Location"); !strings.Contains(location, "payment="+statusSucceeded) {
		t.Fatalf("location = %q, want the succeeded result", location)
	}
	event := expectEvent(t, h.events)
	if event.Type != "payment.succeeded" {
		t.Fatalf("event type = %q, want payment.succeeded", event.Type)
	}
	if event.IntentID != intent.ID || event.OrderID != intent.OrderID || event.AmountSatang != intent.AmountSatang {
		t.Fatalf("event does not describe the intent it settled: %+v", event)
	}
	expectNoFurtherEvent(t, h.events)
}

func TestConfirmDispatchesPaymentFailedWhenTheBuyerDeclines(t *testing.T) {
	h := newPaymentHarness(t)
	intent := h.seedIntent("http://ret")

	rec := h.confirm(intent.ID, "fail")

	if location := rec.Header().Get("Location"); !strings.Contains(location, "payment="+statusFailed) {
		t.Fatalf("location = %q, want the failed result", location)
	}
	if event := expectEvent(t, h.events); event.Type != "payment.failed" {
		t.Fatalf("event type = %q, want payment.failed", event.Type)
	}
}

func TestConfirmIsNotFoundForAnUnknownIntent(t *testing.T) {
	h := newPaymentHarness(t)

	rec := h.confirm("pi_nope", "")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	expectNoFurtherEvent(t, h.events)
}

func TestConfirmReplayedOnASettledIntentDispatchesNothingMore(t *testing.T) {
	h := newPaymentHarness(t)
	intent := h.seedIntent("http://ret")

	h.confirm(intent.ID, "")
	expectEvent(t, h.events)

	replay := h.confirm(intent.ID, "")

	if replay.Code != http.StatusSeeOther {
		t.Fatalf("replay status = %d, want 303", replay.Code)
	}
	if location := replay.Header().Get("Location"); !strings.Contains(location, "payment="+statusSucceeded) {
		t.Fatalf("replay location = %q, want the original result", location)
	}
	expectNoFurtherEvent(t, h.events)
}

func TestConfirmAppendsTheResultToAReturnUrlThatAlreadyHasAQuery(t *testing.T) {
	h := newPaymentHarness(t)
	plain := h.seedIntent("http://ret/orders/1")
	queried := h.seedIntent("http://ret/orders/2?from=email")

	plainLocation := h.confirm(plain.ID, "").Header().Get("Location")
	queriedLocation := h.confirm(queried.ID, "").Header().Get("Location")

	if plainLocation != "http://ret/orders/1?payment="+statusSucceeded {
		t.Fatalf("location = %q, want a ? separator", plainLocation)
	}
	if queriedLocation != "http://ret/orders/2?from=email&payment="+statusSucceeded {
		t.Fatalf("location = %q, want an & separator", queriedLocation)
	}
}
