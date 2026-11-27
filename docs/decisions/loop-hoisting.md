# Hoisting loop-invariant work by hand

Hot loops in this codebase read their bound into a local first, rather than leaving it in the loop
condition:

```ts
const l = arr.length;
let i: number;
for (i = 0; i < l; i++) { ... }
```

`for (let i = 0; i < obj.length; i++)` re-reads the property on every iteration.

## Why the engine does not do it for us

V8 can hoist that read on its own, but only when the value is a plain array field and the loop body
calls nothing opaque. Two things in this codebase break both halves of that condition. The length
often sits behind a getter - `BufferReader.length`, `SmartBuffer.length` - and the body usually calls
a parser or a decoder, which the compiler has to treat as able to change anything. That describes
most of the loops where the cost would matter, so the optimisation that would make the manual hoist
redundant is exactly the one that does not fire here.

The same reasoning covers a condition that does not depend on the loop variable, such as
`level < dim.length - 1`. Lift the whole comparison, not only the property read.

## What stays inside the loop

Declaring `let x` in the loop body costs nothing when no closure captures it, so it stays scoped
there. Hoisting it matters only when a closure does capture it, and in that case hoisting changes
behaviour anyway, which makes it a different decision rather than a free one.
