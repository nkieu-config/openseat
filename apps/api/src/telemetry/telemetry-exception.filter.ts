import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlContextType } from '@nestjs/graphql';
import { SpanStatusCode, trace } from '@opentelemetry/api';

@Catch()
export class TelemetryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) {
      const span = trace.getActiveSpan();
      if (span) {
        if (exception instanceof Error) {
          span.recordException(exception);
        }
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
    }
    if (host.getType<GqlContextType>() === 'graphql') {
      throw exception;
    }
    super.catch(exception, host);
  }
}
