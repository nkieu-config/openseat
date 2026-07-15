package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
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

func verifyAdmission(secret, token string, now time.Time) (admissionClaims, error) {
	var claims admissionClaims
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return claims, fmt.Errorf("malformed token")
	}
	signingInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	expected := b64url(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return claims, fmt.Errorf("bad signature")
	}
	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return claims, fmt.Errorf("bad payload encoding")
	}
	if err := json.Unmarshal(payloadJSON, &claims); err != nil {
		return claims, fmt.Errorf("bad claims")
	}
	if now.Unix() >= claims.Exp {
		return claims, fmt.Errorf("token expired")
	}
	return claims, nil
}
