# postgrejs-otel

OpenTelemetry instrumentation for [postgrejs](https://www.postgrejs.com/).

Work in progress, not published yet. postgrejs will publish query start, end
and error events on Node's `diagnostics_channel`, and this package will turn
them into OpenTelemetry spans. Datadog users will be able to collect them
through dd-trace's OpenTelemetry support.
