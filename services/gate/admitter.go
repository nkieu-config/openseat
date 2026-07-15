package main

import (
	"context"
	"log"
	"time"
)

type admitter struct {
	queue    *Queue
	batch    int
	interval time.Duration
	logger   *log.Logger
}

func newAdmitter(queue *Queue, batch int, interval time.Duration, logger *log.Logger) *admitter {
	return &admitter{queue: queue, batch: batch, interval: interval, logger: logger}
}

func (a *admitter) Run(ctx context.Context) {
	ticker := time.NewTicker(a.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.tick(ctx)
		}
	}
}

func (a *admitter) tick(ctx context.Context) {
	events, err := a.queue.ActiveEvents(ctx)
	if err != nil {
		a.logger.Printf("admitter: listing events failed: %v", err)
		return
	}
	for _, eventID := range events {
		if _, err := a.queue.Admit(ctx, eventID, a.batch); err != nil {
			a.logger.Printf("admitter: admit %s failed: %v", eventID, err)
		}
	}
}
