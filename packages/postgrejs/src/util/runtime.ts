/**
 * Whether this client is running inside a Cloudflare Worker.
 *
 * @returns True on workerd, false on Node.js, Bun and anything else.
 */
/* The documented tell, and the one `pg` uses: since the
   `global_navigator` compatibility flag went on, workerd defines
   `navigator.userAgent` and sets it to exactly this. Node and Bun define
   `navigator` too, with a userAgent of their own, so the test is for the
   whole string rather than a substring of it.

   Asked on each call rather than read once at load: it is reached once
   per connection, where the cost is nothing, and a value frozen at
   module load cannot be tested from both sides. */
export function isWorkerd(): boolean {
  return (
    typeof navigator === 'object' &&
    navigator !== null &&
    (navigator as { userAgent?: unknown }).userAgent === 'Cloudflare-Workers'
  );
}
