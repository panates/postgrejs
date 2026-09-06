---
name: Bug report
about: Report unexpected or incorrect behavior
title: ''
labels: ''
assignees: ''

---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
A minimal, self-contained code snippet that reproduces the issue - the
connection options used (redact any password/host you don't want public)
and the query or API calls involved.

```ts
// e.g.
const connection = new Connection({ host: 'localhost', database: 'test' });
await connection.connect();
const result = await connection.query('select 1');
```

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened - include the full error message and stack trace,
or the incorrect value returned, if applicable.

**Environment**
 - PostgreJS version: [e.g. 3.0.0]
 - Node.js version: [e.g. 22.1.0]
 - PostgreSQL version and provider: [e.g. PostgreSQL 16, self-hosted / RDS / Supabase / ...]
 - OS: [e.g. Ubuntu 22.04]

**Additional context**
Anything else relevant - connection pooling, SSL/TLS settings, whether it
reproduces consistently or intermittently, etc.
