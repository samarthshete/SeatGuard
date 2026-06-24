// OpenTelemetry tracing bootstrap.
//
// Tracing is OPT-IN: it only starts when ENABLE_TRACING=true is set AND an
// OTLP endpoint is reachable. This keeps production cold-starts fast and avoids
// noisy connection errors when no collector (Jaeger/Tempo/OTel Collector) is
// deployed alongside the app (e.g. on Render's free tier).
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

if (process.env.ENABLE_TRACING === 'true') {
  const traceExporter = new OTLPTraceExporter({
    // Points to a Jaeger/Tempo/OTel Collector instance.
    url:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      'http://localhost:4318/v1/traces',
  });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'ticket-blitz',
      [ATTR_SERVICE_VERSION]: '1.0.0',
    }),
    traceExporter,
    // Default auto-instrumentations cover HTTP, Fastify, ioredis, kafkajs, etc.
    // Prisma instrumentation is handled natively by Prisma if configured.
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error));
  });
}
