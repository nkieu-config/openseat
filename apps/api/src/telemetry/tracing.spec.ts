import { startTelemetry } from './tracing';

describe('startTelemetry', () => {
  it('returns null when OTEL_EXPORTER_OTLP_ENDPOINT is unset', () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    expect(startTelemetry()).toBeNull();
  });
});
