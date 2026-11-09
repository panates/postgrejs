import process from 'node:process';
import { trace } from '@opentelemetry/api';

/**
 * Warns, through `process.emitWarning()`, when a tracer provider is
 * registered globally but the copy of `@opentelemetry/api` this package
 * loaded cannot see it, so every span would silently go nowhere.
 *
 * @internal
 */
/* Every copy of the API keeps its registrations under one Symbol.for() key
   on globalThis, stamped with the version of the copy that made the first
   one. A copy refuses a registry stamped with an older minor than its own,
   and then hands out its own empty proxy instead of the registered
   provider: that difference is what is checked here. It happens when an
   application on API 1.10 also runs dd-trace 6, which keeps its own 1.9.x
   copy. The warning is all that can be done: taking the provider from the
   registry directly would still leave the context manager out of reach, so
   every span would be a root. diag is not used because it logs nowhere
   unless a logger has been set up, which is the same silence. */
export function warnOnHiddenProvider(): void {
  const registry = (globalThis as any)[Symbol.for('opentelemetry.js.api.1')];
  if (!registry?.trace || trace.getTracerProvider() === registry.trace) return;
  process.emitWarning(
    `A tracer provider is registered through @opentelemetry/api ` +
      `${registry.version}, which the copy postgrejs-otel loaded does not ` +
      `accept, so its spans are dropped. Install the same @opentelemetry/api ` +
      `version as the code that registers the provider: with dd-trace 6, ` +
      `a 1.9.x release.`,
    { code: 'POSTGREJS_OTEL_HIDDEN_PROVIDER' },
  );
}
