/**
 * React/Preact ref-compat helper.
 *
 * `@base-ui/react` types a component's `ref` as a union that includes a
 * callback taking `never`, which Preact's `RefCallback<T | null>` will not
 * accept. The mismatch is type-only, so wrappers forward props without `ref`.
 */
export function withoutRef<T extends { ref?: unknown }>(props: T): Omit<T, 'ref'> {
   const { ref: _ref, ...rest } = props;
   return rest;
}
