import 'dotenv/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { Attributes } from '@opentelemetry/api';
import type {
  ReadableSpan,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

let sdk: NodeSDK | null = null;

const URL_ATTRIBUTES = ['http.url', 'http.target', 'url.full', 'url.path'];

export function withoutQuery(target: string): string {
  const cut = target.indexOf('?');
  return cut === -1 ? target : target.slice(0, cut);
}

export function scrubSpanUrls(attributes: Attributes): void {
  for (const key of URL_ATTRIBUTES) {
    const value = attributes[key];
    if (typeof value === 'string' && value.includes('?')) {
      attributes[key] = withoutQuery(value);
    }
  }
  if (typeof attributes['url.query'] === 'string') {
    attributes['url.query'] = '';
  }
}

function urlScrubbingProcessor(): SpanProcessor {
  return {
    onStart: () => {},
    onEnd: (span: ReadableSpan) => scrubSpanUrls(span.attributes),
    shutdown: () => Promise.resolve(),
    forceFlush: () => Promise.resolve(),
  };
}

export function startTelemetry(): NodeSDK | null {
  if (sdk) {
    return sdk;
  }
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return null;
  }
  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'openseat-api',
    traceExporter: new OTLPTraceExporter(),
    spanProcessors: [urlScrubbingProcessor()],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15_000,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => {
    void sdk?.shutdown();
  });
  return sdk;
}

startTelemetry();
