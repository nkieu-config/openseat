package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"time"
)

type admissionClaims struct {
	Sub     string `json:"sub"`
	EventID string `json:"eventId"`
	Iat     int64  `json:"iat"`
	Exp     int64  `json:"exp"`
}

func b64url(raw []byte) string {
	return base64.RawURLEncoding.EncodeToString(raw)
}

func signAdmission(secret, visitorID, eventID string, issuedAt time.Time, ttl time.Duration) string {
	header := b64url([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claims := admissionClaims{
		Sub:     visitorID,
		EventID: eventID,
		Iat:     issuedAt.Unix(),
		Exp:     issuedAt.Add(ttl).Unix(),
	}
	payloadJSON, _ := json.Marshal(claims)
	signingInput := header + "." + b64url(payloadJSON)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	return signingInput + "." + b64url(mac.Sum(nil))
}
