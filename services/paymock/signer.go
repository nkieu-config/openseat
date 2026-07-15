package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

func Sign(secret string, timestamp int64, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d.", timestamp)
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func SignatureHeader(secret string, timestamp int64, body []byte) string {
	return fmt.Sprintf("t=%d,v1=%s", timestamp, Sign(secret, timestamp, body))
}
