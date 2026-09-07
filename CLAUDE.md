## Project Orientation

`postgrejs` is a from-scratch PostgreSQL wire-protocol client for Node.js/TypeScript - no `libpq`, no native
bindings. See README.md's "Why PostgreJS?" section for the pitch and `doc/BENCHMARKS.md` for performance data
against `pg` and `postgres.js`.

Directory layout:

- `src/protocol/` - the wire protocol itself: `Backend`/`Frontend` message codecs, `PgSocket` (the connected
  socket plus auth/TLS negotiation), `SmartBuffer`/`BufferReader`.
- `src/connection/` - the public-facing layer: `Connection`, `Pool`, `IntlConnection` (the shared internals
  `Connection`/`Pool` both wrap), `Cursor`, `PreparedStatement`, `Portal`, `CopyToStream`/`CopyFromStream`,
  `LogicalReplication`, `LargeObject`.
- `src/data-types/` - one file per PostgreSQL type, each exporting a scalar `DataType` and its array counterpart
  (`encodeBinary`/`decodeBinary`/`encodeText`/`decodeText`/`isType`, registered in `data-type-map.ts`).
- `src/util/` - parsing/encoding helpers used across the above (array literals, dates, buffers, etc).

Tests mirror this in `test/`:

- `test/A-common/` - pure unit tests, no live connection. Prefer this whenever the code under test doesn't
  actually need a socket: build the wire bytes/fake dependency by hand rather than reaching for a live server.
- `test/B-connection/` - integration tests against a real local PostgreSQL (`docker/docker-compose.yml`; see
  CONTRIBUTING.md for the SCRAM/MD5 setup needed for full coverage locally).
- `test/C-data-types/` - one file per data type, round-tripping values through a live connection via
  `_testers.ts`'s `testParse`/`testEncode`.

Every change must come with a test, and the code it touches must be covered - see CONTRIBUTING.md for the full
contributor workflow (lint/compile/test commands, commit message convention, PR checklist).

## Testing Techniques

- **Coverage tool is `c8`, not istanbul.** Use `/* c8 ignore next */` or `/* c8 ignore start */` ... `/* c8 ignore
  stop */` - `/* istanbul ignore next */` is silently not honored here. Even correctly-placed `c8 ignore` comments
  have occasionally been observed not to suppress branch-level reporting on a single line with a ternary/`&&`
  chain; if the coverage number doesn't move after adding one, don't fight it further - just leave a plain
  explanatory comment instead of an ignore directive that isn't doing anything.
- **Classes that wrap a socket/connection** (`CopyToStream`, `CopyFromStream`, `LogicalReplication`, `PgSocket`)
  are best unit-tested directly against a fake stub object (`pause`/`resume`/`sendCopyData`/`execute`/etc. as
  plain functions recording calls) rather than racing real server timing to hit backpressure, mid-stream errors,
  or a dead socket - those are reproducible instantly with a fake and flaky against a real one.
- **PostgreSQL version-gated behavior** must self-skip in CI's matrix (PostgreSQL 12/16/18 - see
  `.github/workflows/test.yml`): check `connection.sessionParameters.server_version` and call `this.skip()` from
  a `function () {}` test callback (not an arrow function - `this` binding is required). Known gates already hit:
  `numeric` Infinity/-Infinity needs PG 14+, direct TLS negotiation needs PG 17+.
- **Before assuming a branch is unreachable**, reason through the actual call sites rather than guessing - it's
  easy to be wrong in both directions (a branch that looks defensive can be reachable through a caller you
  haven't checked yet, and vice versa).
- Dead code (an exported method with zero callers anywhere in `src/`) should be confirmed via
  `grep -rn '\.methodName(' src/` and removed rather than tested, unless it's plausibly part of the public API
  surface a consumer could rely on.

## Working in this repo

- Run `git status` before staging/committing. The user works concurrently in their own terminal on this same
  repo sometimes (e.g. local docker setup files) - `git add <specific files>` still commits whatever else is
  already sitting in the index, so an unrelated in-progress change can end up folded into your commit if you
  don't check first.
- Don't run the full benchmark suite (`npm run bench`) unless asked.

## Code style

### Class member order

Declare members in this order, with non-public ones always at the bottom rather than next to the code that uses them:

1. Properties (private, protected, public order)
2. Constructor
3. Getters / setters
4. Public methods
5. Protected methods
6. Private methods

Prefer `protected` over `private`. Use `private` only when a member genuinely must not be reachable by a subclass — `Connection`, `Pool` and `IntlConnection` extend and wrap each other, so sealing a member closes off a real extension point.

### Loops

Hoist loop-invariant work out of the loop condition and body — `for (let i = 0; i < obj.length; i++)` re-reads the property on every iteration. V8 can only hoist it when the value is a plain array field and the body calls nothing opaque; anything behind a getter (`BufferReader.length`, `SmartBuffer.length`) or any body that calls a parser/decoder blocks that, which is most of this codebase's hot loops. Read it once into a local first:

```ts
const l = arr.length;
let i: number;
for (i = 0; i < l; i++) { ... }
```

The same applies to conditions that don't depend on the loop variable (`level < dim.length - 1`) — lift the whole comparison, not just the property read.

Declaring `let x` inside the loop body costs nothing when no closure captures it, so keep it scoped there; hoisting it only matters when a closure does capture it, and then hoisting would change behaviour anyway.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
