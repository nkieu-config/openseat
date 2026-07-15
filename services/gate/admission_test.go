package main

import (
	"testing"
	"time"
)

func TestSignAndVerifyRoundTrip(t *testing.T) {
	secret := "test-admission-secret"
	issued := time.Unix(1700000000, 0)
	token := signAdmission(secret, "v:abc", "evt_1", issued, 5*time.Minute)
	claims, err := verifyAdmission(secret, token, issued.Add(time.Minute))
	if err != nil {
		t.Fatalf("verify failed: %v", err)
	}
	if claims.Sub != "v:abc" || claims.EventID != "evt_1" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestVerifyRejectsWrongSecret(t *testing.T) {
	issued := time.Unix(1700000000, 0)
	token := signAdmission("right", "v", "e", issued, time.Minute)
	if _, err := verifyAdmission("wrong", token, issued); err == nil {
		t.Fatal("expected signature rejection with wrong secret")
	}
}

func TestVerifyRejectsTamperedSignature(t *testing.T) {
	issued := time.Unix(1700000000, 0)
	token := signAdmission("s", "v", "e", issued, time.Minute)
	tampered := token[:len(token)-2] + "xx"
	if _, err := verifyAdmission("s", tampered, issued); err == nil {
		t.Fatal("expected rejection of tampered token")
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	issued := time.Unix(1700000000, 0)
	token := signAdmission("s", "v", "e", issued, time.Minute)
	if _, err := verifyAdmission("s", token, issued.Add(2*time.Minute)); err == nil {
		t.Fatal("expected rejection of expired token")
	}
}
