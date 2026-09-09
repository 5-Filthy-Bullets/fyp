---
name: ts-quality-bar
description: TypeScript code quality. Use when writing or reviewing TS types, interfaces, unions, generics, narrowing, indexing, imports, exports, error handling, async or cancellation code, timers or fetch calls, tests, fakes, or fixtures.
---

Quality bar for TypeScript. Write as if the strict flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) are on even when they are off; the code stays honest and the migration later is trivial.

Apply every rule to the code you touch. Done means: no unguarded index access, no `undefined` assigned to an optional property, no bare `throw new Error`, every wait bounded and waiting on a real signal, every `it` asserting observable behavior.

## Types

- Guard index results instead of asserting. `segments[0]` returns `T | undefined`; handle the `undefined` branch (`if (major === undefined || ...) return null;`). `!` and `as T` erase the bug; the guard preserves it.
- Conditional spreads instead of assigning `undefined` to an optional property:

  ```ts
  ...(correlation === undefined ? {} : { correlation }),
  ```

- Discriminated unions over optional-field soup. Tag with `readonly _tag:` or `readonly type:` string literals. Narrow with `Extract<Union, { _tag: "Kind" }>` or indexed access (`ConnectionTarget["_tag"]`).
- Exhaustive switch on domain unions with no `default`. Every case returns; the return type makes a missing case a compile error. Non-domain switches (numeric codes, loose enums) may take a `default`.
- `interface` for object shapes and service APIs, with `readonly` fields on anything crossing a boundary. `type` for unions and aliases.
- Branded IDs for entity identifiers. A string is not a user id:

  ```ts
  type ThreadId = string & { readonly __brand: "ThreadId" };
  const threadId = (raw: string): ThreadId => raw as ThreadId;
  ```

- `satisfies` over annotation when a literal must conform to a shape. It checks and infers at once; annotation widens.
- `as const` for module-level literal maps, `Object.freeze` for exported state constants.
- `unknown` plus narrowing over `any`. If you reach for `any`, narrow with `typeof`, `in`, or a predicate first. Cast only inside a validated boundary (a schema transform, a decode).
- Inline `type` imports (`import { type Foo, bar } from "./foo.ts"`), keeping runtime and type imports honest.
- Named exports only. A default export forces every importer to invent a name; migrations and framework-mandated callbacks are the only exception.
- One concept per file. A file holding one exported constant is fine; a file holding eight unrelated exports is not.
- Subpath exports over barrels in shared packages. A barrel makes every import pay for the whole module graph and hides what depends on what. If a folder needs an `index.ts`, curate it (`export * as X from "./x.ts"` plus selected named exports) instead of blanket re-exporting.

## Errors

- Tagged errors over thrown `Error`. A tagged error is a class or object carrying a string literal `_tag`, typed fields, and a user-presentable `message`. It travels in the type system, so every caller sees what can fail.
- Few error classes, many reasons. One class per category with a `reason` literal-union field beats twenty classes with identical shapes:

  ```ts
  type TransientReason =
    | "network"
    | "timeout"
    | "endpoint-unavailable";

  class TransientError extends Error {
    readonly _tag = "TransientError" as const;
    constructor(
      readonly reason: TransientReason,
      readonly detail: string,
      override readonly cause?: unknown,
    ) { super(detail); }
  }
  ```

- Name reason unions `...Reason`, `...Kind`, `...Phase`; classes end in `Error`.
- Per-domain errors module. It defines the domain's error classes and exports the union callers must handle: `type PersistenceError = SqlError | DecodeError;`. One place to read the whole failure surface.
- Map at the adapter boundary. Upstream errors (a driver, an http client, sqlite) translate to domain errors in one mapping module, usually an exhaustive switch on `_tag` with no `default`. Domain logic downstream never sees foreign error types.
- Preserve the chain. Wrap with `cause` (or the equivalent field) so the root error survives logging. Dropping the cause turns a five-minute debug into an afternoon.
- Every `catch` recovers, rethrows as a tagged error, or rethrows unchanged. A catch that only logs loses the failure and lies to the caller's type.
- Message discipline. `message` reads as a sentence a user or maintainer can act on: `` `SQL error in ${operation}: ${detail}` ``. Payload data that may hold secrets stays out of messages and detail fields; error text often ends up in logs, tickets, and UIs. If a rejected request's body may contain credentials, the error carries issue tags or field paths, never the body.

## Async

- Inject what the machine does; keep logic pure. Clocks, random, uuid, timers, fetch, filesystem, and sockets are capabilities the caller provides. `Date.now()`, `Math.random()`, `crypto.randomUUID()`, `setTimeout`, and bare `fetch` belong at the composition root or inside an adapter, not inside pure orchestration. This is what makes the code testable without monkey-patching globals.
- Complexity belongs at the adapter boundary. The core maps inputs to outputs; the adapter owns processes, sockets, and files. UI stays dumb.
- Every wait is bounded. A socket gets a timeout, a request gets a deadline, an idle loop gets a cap. Nothing waits unbounded.
- Await an acknowledgement, never a delay. When work completes asynchronously, wait on the typed signal that says it completed: a resolved promise, a typed receipt, a worker drain, an observable state field. A fixed sleep encodes a guess about timing and fails under load.
- Polling, when unavoidable, polls a condition with a deadline, not a counter.
- Thread `AbortSignal` through cancellable native work and honor it at every await. Launching work without a cancellation path means the user pays for work they abandoned.
- Wrap event emitters and callbacks settle-guarded and cancel-safe: a `settled` flag so the callback fires once, and a cleanup that releases the listener on cancel:

  ```ts
  let settled = false;
  const settle = (value: Result) => {
    if (settled) return;
    settled = true;
    resolve(value);
  };
  // ... return a cleanup that removes listeners and closes resources
  ```

- Repeating work coalesces through a keyed worker or queue, not raw promise maps. If two callers can request the same unit of work concurrently, deduplicate.
- An async failure is a rejected promise carrying a tagged error, not an unhandled rejection and not a logged-and-continue. Fire-and-forget work still reports failure somewhere the caller or operator sees it.

## Testing

- Behavior tests, feature-scoped and deterministic. A test states what the code does for its caller, not how it does it. Meaningful logic, decisions, state transitions, wire codecs, error mappings.
- Refuse to test: callback wiring, props passed through, a test that reads like a copy of the implementation, snapshots of internal markup. If the refactor would break the test without changing behavior, the test tests the wrong thing.
- Colocated `foo.test.ts` next to `foo.ts`. Split by feature, not by size: `decider.settled.test.ts`, `decider.pinned.test.ts`. Shared fixtures get names like `foo.testFixtures.ts`, never a `.test.ts` suffix.
- One `it` per behavior. Titles read as sentences: `it("compares shorthand versions numerically instead of lexically")`. Comment regressions where they live: `// Regression: "20" vs "9" previously compared as strings.`
- No sleeps, no polling, no real time. Wait on drains, receipts, promises, or observable state. A test that needs a timeout to pass is wrong; a timeout exists only as a fail-fast guard so a hang fails instead of stalling the suite. If the source needs a fake clock and has none, that is a design bug in the source, not an excuse for a flaky test.
- Hand-roll recorded fakes and type them against the real thing:

  ```ts
  const makeRecordedFetch = () => {
    const calls: Array<Parameters<typeof fetch>> = [];
    const fetchFn = (async (...args: Parameters<typeof fetch>) => {
      calls.push(args);
      return new Response("{}");
    }) satisfies typeof fetch;
    return { fetchFn, calls };
  };
  ```

  `satisfies typeof fetch` keeps the fake honest when the real signature changes.
- One contract harness per adapter interface. Every implementation runs the same behavioral test suite, so a new driver cannot quietly skip an edge case.
- Legacy violations under a lint rule get a counted ceiling, not a blanket disable: no net-new occurrences, lower the ceiling when you migrate a file, delete the entry at zero. Unused disables fail lint; a suppression carries a written reason.

## Completion

Every file you touched: index access guarded, domain unions exhaustive, ids branded, exports named. Errors tagged, classified with a reason literal, chained to their cause, messages presentable and secret-free. Async paths injecting machine effects, bounded, cancellable end to end. Tests asserting behavior a caller could observe, waiting only on real signals, fakes typed with `satisfies`. If you wrote `catch (e)` without a recovery or wrap, imported through a barrel, reached for `any`, or left a test that would pass with the implementation deleted and stubbed, stop and fix it before moving on.

---

Conventions distilled from the T3 Code codebase, used as the reference for mergeable-code standards.
