# Comment placement: TSDoc first, the note under it

A declaration carries two kinds of writing, and they go in this order: the TSDoc block that answers
the caller's question, then a plain block comment with everything else this codebase wants to record
about the declaration - why it is the way it is, what was measured, what was tried and thrown away,
which branch cannot currently fire.

```ts
/**
 * What a caller needs.
 *
 * @param n How many.
 */
/* Why it is the way it is: the measurement, the alternative that lost,
   the constraint nobody would guess. */
export function take(n: number): void {}
```

## Why this order and not the other one

The tooling does not care. Both orders reach the emitted `.d.ts` identically, the plain block is
stripped from it either way, and the language service shows the same hover text for both. That was
checked rather than assumed, which is what settles it: with nothing mechanical to decide the
question, the order is a choice about readers.

Two readers come to a declaration. The caller wants the contract and stops at the first block. The
maintainer wants the reasoning and keeps going. Putting the TSDoc first serves both in the order they
arrive, and it keeps a note that runs to twenty lines of measurements from pushing the contract away
from the code it describes.

## Where the line falls

A note that is genuinely about the *contract* rather than the implementation reads better as the
TSDoc's last paragraph than as a block underneath it. The test is whether a caller who never opens
the file would want it.

Everything that belongs to the TSDoc stays inside it, `@param`, `@returns` and every other tag
included. Line comments inside a function body are a separate matter and stay where they are; this
decision is about what sits above a declaration.
