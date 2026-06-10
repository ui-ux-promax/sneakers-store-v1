import * as Sentry from '@sentry/nextjs';
import { scrubPii } from './pii-scrub';
import { getRequestId } from './request-context';

const SERVICE = 'stride-app';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, err?: unknown, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

function normalizeError(err: unknown): LogFields {
  if (err instanceof Error) return { err: { name: err.name, message: err.message, stack: err.stack } };
  if (err === undefined) return {};
  return { err: { value: err } };
}

function emit(level: LogLevel, message: string, fields: LogFields) {
  const safeFields = scrubPii({ ...fields });
  const requestId = getRequestId();
  const payload = {
    level, time: new Date().toISOString(), service: SERVICE,
    ...(requestId ? { requestId } : {}), message, ...safeFields,
  };
  const text = JSON.stringify(payload);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else if (level === 'debug') console.debug(text);
  else console.log(text);
}

function makeLogger(baseFields: LogFields): Logger {
  return {
    debug: (m, f) => emit('debug', m, { ...baseFields, ...(f ?? {}) }),
    info: (m, f) => emit('info', m, { ...baseFields, ...(f ?? {}) }),
    warn: (m, f) => emit('warn', m, { ...baseFields, ...(f ?? {}) }),
    error: (m, err, f) => {
      emit('error', m, { ...baseFields, ...normalizeError(err), ...(f ?? {}) });
      // Мост в Sentry (noop без DSN). PII скрабится перед передачей.
      // normalizeError(err) в extra — чтобы не-Error payload не потерялся при new Error(m).
      Sentry.captureException(err instanceof Error ? err : new Error(m), {
        tags: { event: m },
        extra: scrubPii({ ...baseFields, ...normalizeError(err), ...(f ?? {}) }),
      });
    },
    child: (bindings) => makeLogger({ ...baseFields, ...bindings }),
  };
}

export const logger: Logger = makeLogger({});
