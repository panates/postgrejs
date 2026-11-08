/* The instrumentation is not written yet. postgrejs first has to publish query
   start, end and error on node:diagnostics_channel; this package will turn
   those events into OpenTelemetry spans. Until then the package is not
   published (see .rmanrc.yml). */
export {};
