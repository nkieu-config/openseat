package main

import (
	"context"
	"log"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

var (
	meter             = otel.Meter("gate")
	joinsTotal, _     = meter.Int64Counter("gate_joins_total")
	admittedTotal, _  = meter.Int64Counter("gate_admitted_total")
	sseConnections, _ = meter.Int64UpDownCounter("gate_sse_connections")
)

func setupTelemetry(ctx context.Context) func(context.Context) error {
	noop := func(context.Context) error { return nil }
	if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") == "" {
		log.Printf("telemetry: disabled (OTEL_EXPORTER_OTLP_ENDPOINT is unset)")
		return noop
	}
	res, err := resource.New(ctx,
		resource.WithAttributes(attribute.String("service.name", "openseat-gate")),
		resource.WithFromEnv(),
	)
	if err != nil {
		log.Printf("telemetry: resource detection degraded: %v", err)
	}
	if res == nil {
		res = resource.Default()
	}
	traceExp, err := otlptracehttp.New(ctx)
	if err != nil {
		log.Printf("telemetry: disabled (trace exporter: %v)", err)
		return noop
	}
	metricExp, err := otlpmetrichttp.New(ctx)
	if err != nil {
		log.Printf("telemetry: disabled (metric exporter: %v)", err)
		return noop
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExp),
		sdktrace.WithResource(res),
	)
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExp,
			sdkmetric.WithInterval(15*time.Second),
		)),
		sdkmetric.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetMeterProvider(mp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))
	log.Printf("telemetry: exporting to %s as %s",
		os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
		envOr("OTEL_SERVICE_NAME", "openseat-gate"))
	return func(shutdownCtx context.Context) error {
		traceErr := tp.Shutdown(shutdownCtx)
		metricErr := mp.Shutdown(shutdownCtx)
		if traceErr != nil {
			return traceErr
		}
		return metricErr
	}
}

func registerQueueDepthGauge(queue *Queue) {
	depth, err := meter.Int64ObservableGauge("gate_queue_depth")
	if err != nil {
		return
	}
	_, _ = meter.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
		events, err := queue.ActiveEvents(ctx)
		if err != nil {
			return nil
		}
		for _, eventID := range events {
			if n, err := queue.rdb.ZCard(ctx, queueKey(eventID)).Result(); err == nil {
				o.ObserveInt64(depth, n,
					metric.WithAttributes(attribute.String("event_id", eventID)))
			}
		}
		return nil
	}, depth)
}
