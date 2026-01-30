     ____                     __      __
    /\  _`\                  /\ \    /\ \                                   __
    \ \ \ \ \     __      ___\ \ \/'\\ \ \____    ___     ___      __      /\_\    ____
     \ \  _ <'  /'__`\   /'___\ \ , < \ \ '__`\  / __`\ /' _ `\  /'__`\    \/\ \  /',__\
      \ \ \ \ \/\ \ \.\_/\ \__/\ \ \\`\\ \ \ \ \/\ \ \ \/\ \/\ \/\  __/  __ \ \ \/\__, `\
       \ \____/\ \__/.\_\ \____\\ \_\ \_\ \_,__/\ \____/\ \_\ \_\ \____\/\_\_\ \ \/\____/
        \/___/  \/__/\/_/\/____/ \/_/\/_/\/___/  \/___/  \/_/\/_/\/____/\/_/\ \_\ \/___/
                                                                           \ \____/
                                                                            \/___/
    (_'_______________________________________________________________________________'_)
    (_.———————————————————————————————————————————————————————————————————————————————._)


Backbone supplies structure to JavaScript-heavy applications by providing models with key-value binding and custom events, collections with a rich API of enumerable functions, views with declarative event handling, and connects it all to your existing application over a RESTful JSON interface.

For Docs, License, Tests, pre-packed downloads, and everything else, really, see:
https://backbonejs.org

To suggest a feature or report a bug:
https://github.com/jashkenas/backbone/issues

For questions on working with Backbone or general discussions:
[security policy](SECURITY.md),
https://stackoverflow.com/questions/tagged/backbone.js,
https://matrix.to/#/#jashkenas_backbone:gitter.im or
https://groups.google.com/g/backbonejs

Backbone is an open-sourced component of DocumentCloud:
https://github.com/documentcloud

Testing powered by SauceLabs:
https://saucelabs.com

Many thanks to our contributors:
https://github.com/jashkenas/backbone/graphs/contributors

Special thanks to Robert Kieffer for the original philosophy behind Backbone.
https://github.com/broofa

This project adheres to a [code of conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## Backbone.Reactive: Behavioral Invariants

This document defines the guaranteed behavior of Backbone.Reactive. These invariants must not change without explicit consensus, as they form the contract that tests and users depend on.

### What Backbone.Reactive Supports

- **Reactive models**: Models with `reactive: true` are wrapped in ES6 Proxy for dependency tracking
- **Computed properties**: Cached, dependency-driven, and lazily evaluated properties
- **Reactive views**: Views that auto-update when accessed model/collection properties change
- **Autoruns**: Functions that re-execute when their accessed dependencies change
- **Batching**: Deferred reactive updates that flush together at batch exit

### What Backbone.Reactive Does NOT Support

- **IE11 or browsers without ES6 Proxy**: Falls back to non-reactive mode
- **Automatic wrapping**: Models/collections must opt-in via `reactive: true` or explicit `wrap()`
- **Sync/async configuration**: Backbone events fire synchronously; this is not configurable
- **Granular cache control**: Computed properties invalidate on any dependency change; no partial invalidation
- **Dependency tracking without proxy**: Direct property access (`model.attributes.foo`) bypasses tracking

---

### Computed Properties

**Invariants:**

1. **Caching**: Computed properties are cached per-model instance using a WeakMap. Cache persists until explicit invalidation.

2. **Invalidation is dependency-driven**: A computed property invalidates if and only if a property it accessed during its last computation changes.

3. **Transitive invalidation**: If computed B depends on computed A, and A's dependency changes, both A and B invalidate. Invalidation propagates through the entire dependency graph.

4. **Single recomputation per invalidation**: A computed property recomputes at most once per invalidation, regardless of how many consumers access it. If computed A is read by both B and C after invalidation, A computes once and both consumers receive the cached result.

5. **Runtime dependency tracking**: Computed properties track only the dependencies accessed during the most recent execution. Conditional branches establish different dependency sets across executions.

---

### autorun()

**Signature:** `Backbone.Reactive.autorun(fn) -> dispose()`

**Invariants:**

1. **Non-reentrant**: If an autorun writes to a property it also reads, the autorun will NOT synchronously re-enter itself. Re-execution is deferred asynchronously or during the next batch flush.

2. **Deduplication during batch**: If multiple dependencies change inside a `batch()`, the autorun queues at most one pending re-execution. It will not run multiple times for the same batch.

3. **Disposal**: Calling the returned `dispose()` function removes all listeners and prevents further executions. The autorun will never execute again after disposal.

4. **Initial execution**: The autorun executes once immediately upon creation to establish its initial dependency set.

5. **Dependency churn**: Autoruns re-track dependencies on every execution. If the code path changes (e.g., conditional logic), the dependency set updates accordingly.

---

### batch()

**Signature:** `Backbone.Reactive.batch(fn)`

**Invariants:**

1. **Outermost-only flush**: Reactive effects (autoruns, view renders) flush only when the outermost `batch()` exits. Nested batches increment/decrement depth but do not flush.

2. **Batches reactive effects, not Backbone events**: Backbone model/collection events fire synchronously as usual. `batch()` only defers the reactive system's response to those events.

3. **Synchronous execution**: The function passed to `batch()` executes synchronously. Only the *reactive effects* are deferred.

4. **RAF cancellation**: If a view update was scheduled via `requestAnimationFrame` before entering a batch, the batch flush cancels that RAF to prevent double rendering.

---

### Collections

**Invariants:**

1. **Structural change invalidation**: Collection computed properties invalidate when `add()`, `remove()`, `reset()`, or `update()` events fire.

2. **Child model change invalidation**: Collection computed properties invalidate when any child model fires a `change` event (blanket invalidation, not property-specific).

3. **Event-driven only**: Cache invalidation occurs via Backbone event listeners. There are no proxy traps or monkeypatched mutation methods.

---

### Views

**Invariants:**

1. **Accessed properties only**: Reactive views track only the model/collection properties accessed during the most recent `render()`. Changing an unaccessed property does not trigger re-render.

2. **Dependency churn**: Each `render()` re-tracks dependencies from scratch. If the render code path changes (e.g., conditional rendering), the dependency set updates accordingly.

3. **Silent after remove()**: After calling `view.remove()`, the view stops listening to all reactive dependencies and will never render again, even if dependencies change.

4. **Batch-aware rendering**: View renders are deferred and batched via the update scheduler. Multiple dependency changes within a batch result in at most one render per view.

5. **Attached views only**: Views must have `el.parentNode` (be attached to the DOM) to render. Detached views are skipped by the scheduler.

---

### Non-Negotiable Implementation Details

These are not user-facing invariants, but they are load-bearing for the behavior above:

- **WeakMap for computed cache**: Ensures cache is GC-friendly and scoped per-model instance
- **Map-based ReactiveContext**: Dependencies are deduplicated by `"cid:prop"` key
- **Single invalidation path for collections**: Event listeners only; no proxy traps or monkeypatched methods
- **Synchronous event listeners**: All Backbone events and reactive invalidations occur synchronously within the call stack

---

### Testing Contract

The test suite (1275+ assertions) is authoritative. Any change that causes tests to fail violates these invariants unless the test itself is incorrect. The following test categories protect the invariants above:

- **Safety tests** (5): Prevent infinite loops, stack overflows, and double-flush bugs
- **Correctness tests** (10): Validate autorun lifecycle, computed caching, view cleanup, and conditional dependency tracking
- **Integration tests**: Verify end-to-end reactive behavior in realistic scenarios
