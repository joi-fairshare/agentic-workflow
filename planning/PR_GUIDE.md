# Pull Request Review Guide

Use this checklist when opening or reviewing pull requests. Every item applies unless explicitly noted otherwise.

---

## Type Safety

- [ ] **Strict mode passes** -- `tsc --noEmit` completes without errors.
- [ ] **No `any` usage** -- use `unknown` with runtime narrowing, or define a proper type.
- [ ] **`import type` used correctly** -- symbols used only in type position use `import type`.
- [ ] **`.js` extension on all imports** -- required by Node16 ESM module resolution.
- [ ] **Zod schemas have companion type aliases** -- every `FooSchema` has a corresponding `type Foo = z.infer<typeof FooSchema>`.
- [ ] **Route schemas use the dual declaration pattern** -- both `const` value and `type` alias with the same name:
  ```ts
  export const GetMessagesSchema = { params: ..., response: ... } as const;
  export type GetMessagesSchema = typeof GetMessagesSchema;
  ```
- [ ] **`defineRoute()` used for all route registrations** -- captures `TSchema` at compile time for end-to-end type safety between schema and handler.

---

## Error Handling

- [ ] **Services return `AppResult<T>`** -- no service function throws. Use `ok()` and `err()` from `application/result.ts`.
- [ ] **Error codes use `ERROR_CODE` constants** -- never hardcode strings like `"NOT_FOUND"`. Use `ERROR_CODE.notFound`.
- [ ] **Controllers use `appErr()` for error translation** -- converts `AppError` to `ApiResponse` error shape:
  ```ts
  if (!result.ok) return appErr(result.error);
  ```
- [ ] **`statusHint` is set on errors** -- every `err()` call includes an appropriate HTTP status hint (404, 409, etc.).
- [ ] **Preconditions checked before writes** -- validate existence (e.g., `db.getTask()`) before inserting or updating rows to prevent orphaned records.
- [ ] **No uncaught exceptions leak** -- the server catches `ZodError` (400) and unknown errors (500). Services must not rely on the server catch for expected failure modes.

---

## Database

- [ ] **Multi-write operations use `db.transaction()`** -- any service that calls more than one write method wraps them in a transaction for atomicity:
  ```ts
  const result = db.transaction(() => {
    const task = db.insertTask(/* ... */);
    db.insertMessage(/* ... */);
    return task;
  });
  ```
- [ ] **Read-then-write sequences are atomic** -- operations like "fetch unread then mark all read" must be wrapped in a transaction to prevent races.
- [ ] **Row types are accurate** -- `MessageRow` and `TaskRow` interfaces match the actual SQL schema in `db/schema.ts`. New columns require updates to both.
- [ ] **Prepared statements used for repeated queries** -- add statements to the `stmts` object in `createDbClient()` rather than calling `db.prepare()` inline.
- [ ] **Indexes exist for new query patterns** -- if a new query filters on a column, add an index in `MIGRATIONS`.
- [ ] **Nullable fields use `?? null`** -- optional service input fields are coalesced to `null` before passing to the database layer:
  ```ts
  meta_prompt: input.meta_prompt ?? null,
  ```

---

## Testing

- [ ] **Tests exist for new services** -- every new service function has at least one success-path and one error-path test.
- [ ] **In-memory SQLite used** -- tests use `new Database(":memory:")` per `beforeEach`, never a file-based database.
- [ ] **Migrations applied in test setup** -- `raw.exec(MIGRATIONS)` runs before creating the client.
- [ ] **`randomUUID()` for isolation** -- each test uses unique conversation/entity IDs to prevent cross-test interference.
- [ ] **Discriminated union narrowing in assertions** -- always check `result.ok` and early-return before accessing `.data` or `.error`:
  ```ts
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.data.id).toBeDefined();
  ```
- [ ] **Atomicity verified on failure** -- when testing error paths, verify that no partial writes occurred (e.g., no orphaned messages when a task lookup fails).
- [ ] **Tests run with `vitest run`** -- all tests pass before PR submission.

---

## API Design

- [ ] **Zod validation on all inputs** -- every route schema defines `body`, `params`, and/or `querystring` with Zod schemas. The server validates automatically; handlers never call `.parse()`.
- [ ] **UUID fields validated with `z.string().uuid()`** -- all ID and conversation fields use UUID validation, not bare `z.string()`.
- [ ] **String fields validated with `z.string().min(1)`** -- required string fields reject empty strings.
- [ ] **Response schemas defined** -- every route schema includes a `response` Zod schema for documentation and potential response validation.
- [ ] **Correct HTTP status codes** -- POST handlers return 201 on success (handled by `server.ts`), GET returns 200. Error `statusHint` maps to appropriate codes.

---

## Security

- [ ] **Server binds to loopback by default** -- `127.0.0.1` unless `ALLOW_REMOTE=1` is set. New entry points must respect this constraint.
- [ ] **No secrets in code or config** -- `.env` files are in `.gitignore`. Environment variables used for `PORT`, `HOST`, `DB_PATH`.
- [ ] **No sensitive data in error details** -- `AppError.details` must not expose internal state, stack traces, or database internals.
- [ ] **SQL injection prevention** -- all queries use parameterized prepared statements (named `@param` syntax in better-sqlite3). Never interpolate user input into SQL strings.
- [ ] **Input size limits considered** -- large text fields (`payload`, `details`) should have reasonable Zod `.max()` limits if the endpoint is exposed beyond local use.

---

## Documentation & Style

- [ ] **Section comment headers used** -- files with multiple logical sections use the `// ── Section ──────` format.
- [ ] **JSDoc on exported interfaces and functions** -- at minimum, public interfaces and factory functions have `/** */` descriptions.
- [ ] **File naming is kebab-case** -- new files follow `send-context.ts`, `message-schemas.ts` pattern.
- [ ] **No dead code** -- unused imports, variables, or functions are removed.
- [ ] **Consistent `as const` on schema objects** -- route schema objects use `as const` for literal type inference.
