package main

import "testing"

func TestSign(t *testing.T) {
	tests := []struct {
		name      string
		secret    string
		timestamp int64
		body      string
		want      string
	}{
		{
			name:      "known vector",
			secret:    "test-secret",
			timestamp: 1700000000,
			body:      `{"id":"evt_1"}`,
			want:      "c0b7fea967577b3e73bd69e865e3a4daeb36816fab0de39e128565fa68cbab61",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Sign(tt.secret, tt.timestamp, []byte(tt.body))
			if got != tt.want {
				t.Errorf("Sign() = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestSignDiffers(t *testing.T) {
	base := Sign("secret-a", 1700000000, []byte("body"))
	tests := []struct {
		name      string
		secret    string
		timestamp int64
		body      string
	}{
		{"different secret", "secret-b", 1700000000, "body"},
		{"different timestamp", "secret-a", 1700000001, "body"},
		{"different body", "secret-a", 1700000000, "body2"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if Sign(tt.secret, tt.timestamp, []byte(tt.body)) == base {
				t.Error("expected a different signature")
			}
		})
	}
}

func TestSignatureHeader(t *testing.T) {
	header := SignatureHeader("test-secret", 1700000000, []byte(`{"id":"evt_1"}`))
	want := "t=1700000000,v1=c0b7fea967577b3e73bd69e865e3a4daeb36816fab0de39e128565fa68cbab61"
	if header != want {
		t.Errorf("SignatureHeader() = %s, want %s", header, want)
	}
}
