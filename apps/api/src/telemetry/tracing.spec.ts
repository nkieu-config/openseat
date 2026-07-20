import type { Attributes } from '@opentelemetry/api';
import { scrubSpanUrls, startTelemetry, withoutQuery } from './tracing';

describe('startTelemetry', () => {
  it('returns null when OTEL_EXPORTER_OTLP_ENDPOINT is unset', () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    expect(startTelemetry()).toBeNull();
  });
});

describe('withoutQuery', () => {
  it('drops the query string that carries the guest token', () => {
    expect(withoutQuery('/api/orders/abc?token=s3cret')).toBe(
      '/api/orders/abc',
    );
  });

  it('leaves a plain path alone', () => {
    expect(withoutQuery('/api/health')).toBe('/api/health');
  });
});

describe('scrubSpanUrls', () => {
  it('strips the guest token from every url attribute a span may carry', () => {
    const attributes: Attributes = {
      'http.url': 'http://api.test/api/orders/abc?token=s3cret',
      'http.target': '/api/orders/abc?token=s3cret',
      'url.path': '/api/orders/abc?token=s3cret',
      'url.query': 'token=s3cret',
      'http.method': 'GET',
    };

    scrubSpanUrls(attributes);

    expect(JSON.stringify(attributes)).not.toContain('s3cret');
    expect(attributes['http.url']).toBe('http://api.test/api/orders/abc');
    expect(attributes['http.target']).toBe('/api/orders/abc');
    expect(attributes['url.query']).toBe('');
    expect(attributes['http.method']).toBe('GET');
  });

  it('leaves a span without a query string untouched', () => {
    const attributes: Attributes = {
      'http.target': '/api/health',
    };
    scrubSpanUrls(attributes);
    expect(attributes['http.target']).toBe('/api/health');
  });
});
