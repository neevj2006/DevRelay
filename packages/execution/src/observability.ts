import { type Attributes, context, type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

export type LogLevel = "debug" | "error" | "info" | "warn";
export type SafeFields = Readonly<Record<string, unknown>>;

const sensitiveKey =
  /authorization|body|cookie|credential|email|header|password|payload|response|secret|token|url/i;
const allowedField =
  /^(attempt|channel|correlationId|count|deliveryId|durationMilliseconds|event|jobId|jobName|level|method|monitorId|organizationId|outcome|queueAdapter|reason|route|service|serviceId|signal|status|timestamp|traceId|workerId)$/;

export function sanitizeObservabilityFields(fields: SafeFields): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(
        ([key, value]) => allowedField.test(key) && !sensitiveKey.test(key) && value !== undefined,
      )
      .map(([key, value]) => [key, normalizeValue(value)]),
  );
}

function normalizeValue(value: unknown): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 240).replace(/[\r\n\t]/g, " ");
  if (Array.isArray(value)) return value.slice(0, 20).map(normalizeValue);
  return "[redacted]";
}

export function structuredLog(level: LogLevel, event: string, fields: SafeFields = {}): void {
  const span = trace.getActiveSpan();
  const record = {
    ...sanitizeObservabilityFields(fields),
    event,
    level,
    timestamp: new Date().toISOString(),
    ...(span?.spanContext().traceId ? { traceId: span.spanContext().traceId } : {}),
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

type MetricKey =
  | "api.request.duration"
  | "api.request.error"
  | "api.request.total"
  | "check.completed"
  | "check.duplicate"
  | "check.expected"
  | "check.latency"
  | "incident.created"
  | "incident.duplicate"
  | "incident.recovery.duration"
  | "notification.delivery.duration"
  | "notification.delivery.failed"
  | "notification.delivery.succeeded"
  | "notification.duplicate"
  | "polling.fallback"
  | "queue.lag"
  | "sse.connection";

type Sample = { attributes: Record<string, string>; value: number };

class RuntimeMetrics {
  private readonly samples = new Map<MetricKey, Sample[]>();

  record(name: MetricKey, value = 1, attributes: Record<string, string> = {}): void {
    const entries = this.samples.get(name) ?? [];
    entries.push({ attributes: sanitizeMetricAttributes(attributes), value });
    if (entries.length > 2_000) entries.splice(0, entries.length - 2_000);
    this.samples.set(name, entries);
  }

  snapshot() {
    return Object.fromEntries(
      [...this.samples.entries()].map(([name, samples]) => {
        const values = samples.map((sample) => sample.value).sort((a, b) => a - b);
        return [
          name,
          {
            count: values.length,
            max: values.at(-1) ?? 0,
            p95: values.length
              ? values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)]
              : 0,
            sum: values.reduce((sum, value) => sum + value, 0),
          },
        ];
      }),
    );
  }

  reset(): void {
    this.samples.clear();
  }
}

function sanitizeMetricAttributes(attributes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([key]) =>
        ["adapter", "channel", "jobName", "method", "outcome", "route", "status"].includes(key),
      )
      .map(([key, value]) => [key, value.slice(0, 120)]),
  );
}

export const runtimeMetrics = new RuntimeMetrics();

let tracing: { exporter: InMemorySpanExporter; provider: BasicTracerProvider } | undefined;

export function configureLocalTracing(): void {
  if (tracing) return;
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  trace.setGlobalTracerProvider(provider);
  tracing = { exporter, provider };
}

export function finishedLocalSpans(): readonly ReadableSpan[] {
  return tracing?.exporter.getFinishedSpans() ?? [];
}

export function startTraceSpan(name: string, fields: SafeFields): Span {
  return trace
    .getTracer("devrelay")
    .startSpan(name, { attributes: sanitizeTraceAttributes(fields) });
}

export async function shutdownLocalTracing(): Promise<void> {
  await tracing?.provider.shutdown();
  tracing = undefined;
}

export async function withTrace<T>(
  name: string,
  fields: SafeFields,
  operation: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer("devrelay");
  const attributes = sanitizeTraceAttributes(fields);
  const span = tracer.startSpan(name, { attributes });
  try {
    return await context.with(trace.setSpan(context.active(), span), () => operation(span));
  } catch (error) {
    span.recordException(error instanceof Error ? error : new Error("Unknown operation failure"));
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}

function sanitizeTraceAttributes(fields: SafeFields): Attributes {
  const safe = sanitizeObservabilityFields(fields);
  return Object.fromEntries(
    Object.entries(safe).filter((entry): entry is [string, string | number | boolean] =>
      ["boolean", "number", "string"].includes(typeof entry[1]),
    ),
  );
}
