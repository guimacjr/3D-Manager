import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

const tracer = trace.getTracer("3d-manager.mercadolivre", "0.1.0");
let telemetrySdk: NodeSDK | null = null;

function envFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function telemetryEndpointConfigured(): boolean {
  return Boolean(
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() ||
      process.env.OTEL_TRACES_EXPORTER?.trim()
  );
}

export function initializeTelemetry(): void {
  if (telemetrySdk) return;
  if (envFlag(process.env.OTEL_SDK_DISABLED)) return;
  if (!telemetryEndpointConfigured()) return;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME?.trim() || "3d-manager-backend",
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "0.1.0",
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV ?? "development",
  });

  const traceExporter = new OTLPTraceExporter(
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim()
      ? { url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT.trim() }
      : undefined
  );

  telemetrySdk = new NodeSDK({
    resource,
    traceExporter,
  });

  telemetrySdk.start();

  const shutdown = () => {
    void shutdownTelemetry();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

export async function shutdownTelemetry(): Promise<void> {
  if (!telemetrySdk) return;
  const sdk = telemetrySdk;
  telemetrySdk = null;
  await sdk.shutdown().catch(() => undefined);
}

export function activeTraceContext(): { traceId?: string; spanId?: string } {
  const activeSpan = trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();
  return {
    traceId: spanContext?.traceId,
    spanId: spanContext?.spanId,
  };
}

export function runWithSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T> | T
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function startMercadoLivreHttpSpan(params: {
  method: string;
  url: string;
  route: string;
}): { span: Span; spanContext: Context } {
  const parsed = new URL(params.url);
  const span = tracer.startSpan("mercadolivre.http", {
    kind: SpanKind.CLIENT,
    attributes: {
      [ATTR_HTTP_REQUEST_METHOD]: params.method.toUpperCase(),
      [ATTR_SERVER_ADDRESS]: parsed.hostname,
      "http.route": params.route,
      "url.scheme": parsed.protocol.replace(":", ""),
      "marketplace.name": "mercadolivre",
    },
  });

  return {
    span,
    spanContext: trace.setSpan(context.active(), span),
  };
}

export function injectTraceHeaders(headers: Headers, spanContext: Context): void {
  propagation.inject(spanContext, headers, {
    set(carrier, key, value) {
      carrier.set(key, value);
    },
  });
}

export function finishHttpSpan(
  span: Span,
  params: {
    statusCode?: number;
    retryCount?: number;
    error?: unknown;
  }
): void {
  if (typeof params.statusCode === "number") {
    span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, params.statusCode);
    if (params.statusCode >= 400) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${params.statusCode}` });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
  }

  span.setAttribute("http.request.retry_count", params.retryCount ?? 0);

  if (params.error) {
    span.recordException(params.error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: params.error instanceof Error ? params.error.message : String(params.error),
    });
  }

  span.end();
}

export function normalizeMercadoLivreRoute(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);

    if (parts[0] === "users" && parts[2] === "items" && parts[3] === "search") return "/users/{seller}/items/search";
    if (parts[0] === "orders" && parts[1] === "search") return "/orders/search";
    if (parts[0] === "orders" && parts[1]) return "/orders/{order}";
    if (parts[0] === "items" && parts.length === 1) return "/items";
    if (parts[0] === "items" && parts[2] === "prices") return "/items/{item}/prices";
    if (parts[0] === "items" && parts[2] === "variations") return "/items/{item}/variations";
    if (parts[0] === "shipments" && parts[2] === "costs") return "/shipments/{shipment}/costs";
    if (parts[0] === "shipments" && parts[1]) return "/shipments/{shipment}";
    if (parts[0] === "v1" && parts[1] === "payments" && parts[2]) return "/v1/payments/{payment}";
    if (parts[0] === "billing") return "/billing/integration/group/ML/order/details";
    if (parts[0] === "oauth" && parts[1] === "token") return "/oauth/token";
    if (parts[0] === "users" && parts[1] === "me") return "/users/me";

    return `/${parts.slice(0, 3).join("/")}`;
  } catch {
    return "unknown";
  }
}
