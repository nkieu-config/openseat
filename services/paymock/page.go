package main

import (
	"fmt"
	"html/template"
)

var payPage = template.Must(template.New("pay").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PayMock — complete your payment</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
         background: #101830; color: #F5F6FA; font-family: system-ui, -apple-system, sans-serif; }
  .card { width: min(420px, 92vw); background: #1A2340; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px; padding: 32px; }
  .brand { font-weight: 700; letter-spacing: 0.02em; margin: 0 0 4px; }
  .brand span { color: #F0A73C; }
  .note { color: #9AA3C0; font-size: 13px; margin: 0 0 24px; }
  .amount { font-size: 40px; font-weight: 700; margin: 0; font-variant-numeric: tabular-nums; }
  .order { color: #9AA3C0; font-size: 12px; font-family: ui-monospace, monospace; margin: 4px 0 28px; }
  button { width: 100%; padding: 12px 16px; border-radius: 10px; border: none; font-size: 15px;
           font-weight: 600; cursor: pointer; }
  .pay { background: #F0A73C; color: #2B1B03; margin-bottom: 10px; }
  .pay:hover { background: #F5B554; }
  .fail { background: transparent; color: #E88; border: 1px solid rgba(238,136,136,0.4); }
  .fail:hover { background: rgba(238,136,136,0.1); }
  .footer { margin-top: 24px; color: #5C6584; font-size: 12px; text-align: center; }
</style>
</head>
<body>
  <main class="card">
    <p class="brand">Pay<span>Mock</span></p>
    <p class="note">Simulated payment provider — no real money moves here.</p>
    <p class="amount">{{.Amount}}</p>
    <p class="order">order {{.OrderID}}</p>
    <form method="post" action="/pay/{{.IntentID}}/confirm">
      <button class="pay" name="outcome" value="success" type="submit">Pay {{.Amount}}</button>
      <button class="fail" name="outcome" value="fail" type="submit">Simulate a failed payment</button>
    </form>
    <p class="footer">Webhooks are signed, retried, and intentionally sent twice to exercise consumer idempotency.</p>
  </main>
</body>
</html>`))

func formatAmount(satang int64) string {
	return fmt.Sprintf("฿%.2f", float64(satang)/100)
}
