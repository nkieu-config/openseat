package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type admissionVector struct {
	Secret       string `json:"secret"`
	VisitorID    string `json:"visitorId"`
	EventID      string `json:"eventId"`
	IssuedAtUnix int64  `json:"issuedAtUnix"`
	TTLSeconds   int64  `json:"ttlSeconds"`
	Token        string `json:"token"`
}

func loadAdmissionVector(t *testing.T) admissionVector {
	t.Helper()
	path := filepath.Join("..", "..", "packages", "contracts", "admission-token.vector.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read admission vector: %v", err)
	}
	var vector admissionVector
	if err := json.Unmarshal(raw, &vector); err != nil {
		t.Fatalf("parse admission vector: %v", err)
	}
	return vector
}

func TestSignAdmissionMatchesTheSharedVector(t *testing.T) {
	vector := loadAdmissionVector(t)

	token := signAdmission(
		vector.Secret,
		vector.VisitorID,
		vector.EventID,
		time.Unix(vector.IssuedAtUnix, 0),
		time.Duration(vector.TTLSeconds)*time.Second,
	)

	if token != vector.Token {
		t.Fatalf(
			"gate no longer produces the token the API verifies against\n  want %s\n  got  %s",
			vector.Token, token,
		)
	}
}
