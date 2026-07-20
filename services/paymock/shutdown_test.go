package main

import (
	"sync"
	"testing"
	"time"
)

func TestSendDuringCloseStaysRaceFree(t *testing.T) {
	for i := 0; i < 500; i++ {
		d := testDispatcher(false, nil)
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			d.Send("http://127.0.0.1:1/hook", Event{ID: "x"})
		}()
		go func() {
			defer wg.Done()
			d.Close(50 * time.Millisecond)
		}()
		wg.Wait()
	}
}
