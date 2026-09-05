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
