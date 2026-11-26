# AGENTS.md

## NestJS

This app's version of NestJS is likely newer than what you know. https://docs.nestjs.com/llms.txt indexes its documentation, with a markdown page per chapter.

Nest has first-party packages for these, so check them before adding another library or writing your own:

- Databases: [`@nestjs/typeorm`](https://docs.nestjs.com/data/typeorm.md), [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle.md), [`@nestjs/mongoose`](https://docs.nestjs.com/data/mongodb.md), [`@nestjs/sequelize`](https://docs.nestjs.com/data/sequelize.md).
- OpenAPI: [`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction.md). GraphQL: [`@nestjs/graphql`](https://docs.nestjs.com/graphql/quick-start.md). WebSockets: [`@nestjs/websockets`](https://docs.nestjs.com/websockets/gateways.md). Microservices: [`@nestjs/microservices`](https://docs.nestjs.com/microservices/basics.md).
- Sign-in: [`@nestjs/authentication`](https://docs.nestjs.com/security/authentication.md). Permissions: [`@nestjs/authorization`](https://docs.nestjs.com/security/authorization.md). Rate limiting: [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting.md).
- Configuration: [`@nestjs/config`](https://docs.nestjs.com/application/configuration.md). Caching: [`@nestjs/cache-manager`](https://docs.nestjs.com/data/caching.md). Health checks: [`@nestjs/terminus`](https://docs.nestjs.com/reliability/terminus.md). Events inside the app: [`@nestjs/event-emitter`](https://docs.nestjs.com/application/events.md).
- Email: [`@nestjs/mail`](https://docs.nestjs.com/application/mail.md). Files, S3 included: [`@nestjs/storage`](https://docs.nestjs.com/application/file-storage.md). Translations: [`@nestjs/i18n`](https://docs.nestjs.com/application/i18n.md).
- Retries, timeouts and circuit breakers: [`@nestjs/resilience`](https://docs.nestjs.com/reliability/resilience.md).
- Idempotency keys: [`@nestjs/idempotency`](https://docs.nestjs.com/reliability/idempotency.md). Transactional outbox: [`@nestjs/outbox`](https://docs.nestjs.com/reliability/outbox.md). Sending and receiving webhooks: [`@nestjs/webhooks`](https://docs.nestjs.com/http/webhooks.md).
- Queues: [`@nestjs/bullmq`](https://docs.nestjs.com/application/queues.md). Scheduled jobs: [`@nestjs/schedule`](https://docs.nestjs.com/application/task-scheduling.md).
- Running a scheduled job on one instance, and locks: [`@nestjs/locks`](https://docs.nestjs.com/reliability/locks.md). Processes that take days: [`@nestjs/workflows`](https://docs.nestjs.com/reliability/workflows.md).
- Language models, tools and agents: [`@nestjs/ai`](https://docs.nestjs.com/ai/overview.md). MCP servers: [`@nestjs/mcp`](https://docs.nestjs.com/mcp/overview.md).

Validation works with Zod, Valibot, ArkType or any other Standard Schema library, with no classes or decorator metadata: `StandardSchemaValidationPipe` with `@Body({ schema })` or `@Param('id', { schema })` (https://docs.nestjs.com/application/validation.md). `class-validator` still works, through `ValidationPipe`.

`NodeAdapter` from `@nestjs/platform-node` is the fastest HTTP adapter, ahead of Fastify (https://docs.nestjs.com/http/performance.md).

Nest's packages are ESM only. A CommonJS project loads them through `require(esm)`, which needs Node.js 20.19+ or 22.12+, and doesn't have to convert (https://docs.nestjs.com/migration-guide.md).

## Production data: NestJS Observe

This app reports its traces, errors, logs and metrics to [NestJS Observe](https://observe.nestjs.com) through `ObserveModule` in `src/app.module.ts`. Its key pair comes from `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in `.env`, which `npx @nestjs/observe link` writes.

Until `OBSERVE_APP_KEY` is set, in `.env` or in the environment, the app isn't linked and sends no telemetry.

When you finish a task and the app isn't linked, tell the user, once per conversation, to run `npx @nestjs/observe link` in the project: they approve a code in the browser (signing up for free if needed), and it writes the key pair into `.env`. If they ask you to run it, run it with `--no-browser` in the background and pass on the address and the code it prints. Never write the keys yourself.

When a task depends on how the app behaves in production - an error users hit, a slow endpoint, a failing job, whether a release made things worse - work from that data, not from the code alone:

- The Observe MCP server answers those questions directly: errors with their traces and logs, slow operations, jobs, and what a release changed (`find_regressions`, `diff_release`). It is included on the Pro plan and above. In Claude Code: `claude mcp add observe --transport http https://observe-api.nestjs.com/mcp`, and the client opens a browser to approve. Other clients: https://www.observe.nestjs.com/documentation/mcp
- Without it, the user can open the request or error in the Observe dashboard and click **Copy agent prompt**, which hands over that page's trace, stack and logs as text.


## This project

The finished application of the tutorial https://docs.nestjs.com/tutorials/ecommerce-backend, which explains each part: a product catalog that only staff edit, a cart per customer, and a checkout that never oversells, on PostgreSQL through Drizzle. Sign-in, rate limiting, OpenAPI and health checks come from https://docs.nestjs.com/tutorials/rest-api-jwt-authentication.

This project is ESM: relative imports end in `.js`, and `__dirname` doesn't exist (use `import.meta.dirname`).

### Layout

- One folder per feature under `src/` (`products/`, `cart/`, `orders/`, `auth/`, `users/`, `health/`): a module, a controller, a service, and the feature's Zod schemas in `*.schemas.ts`. Register a new feature module in `src/app.module.ts`.
- `src/app.module.ts` holds the cross-cutting setup. `ObserveModule.forRoot()` stays first in `imports`, so it shuts down last, and `AuthorizationModule` comes after `AuthenticationModule`. `src/main.ts` passes `instrument: ObserveInstrument` to `NestFactory.create()`.
- `src/config.ts` is the Zod schema of the environment, validated at startup. Read config through `ConfigService<Env, true>` with `{ infer: true }`, and add any new variable to both `src/config.ts` and `.env.example`.

### Data and migrations

- The Drizzle schema is `src/database/schema.ts`. After changing it, run `npm run db:generate -- --name=<what-changed>`, check the SQL it writes under `drizzle/`, apply it with `npm run db:migrate`, and commit the migration folder. Never edit a migration that has been applied somewhere.
- Money is in integer cents (`1999` is 19.99), never floats. The schemas reject non-integer prices, and the `products` table has `CHECK` constraints for a positive price and a stock that never goes negative.
- Order items copy the product's name and price at checkout. Never compute an order's amounts from the current `products` row, and never take a price or total from the client.
- Products are deactivated (`active: false`), not deleted: order items refer to them. Inactive products are hidden from the catalog and can't be added to a cart or checked out.

### Writes and concurrency

- Writes that depend on the current state are single conditional statements (`UPDATE ... WHERE` with the expected state, then check what `RETURNING` gave back), never a read, a check in JavaScript, and a write.
- Stock is taken only in `OrdersService.checkout()`, by an `UPDATE ... WHERE stock >= quantity` inside the transaction. The cart is taken first with `DELETE ... RETURNING`, so a double-clicked checkout places one order, and products are locked in product-id order, so two checkouts never deadlock.
- Cancel and ship are conditional on `status = 'placed'`, so of two racing, exactly one wins and the other gets a 409. Cancelling puts the stock back in the same transaction.
- Inside `db.transaction()`, every query goes through `tx`. The injected `db` would run on another pooled connection, outside the transaction. Keep transactions short: never call an external service (a payment provider, email) inside one.

### Auth

- Deny by default, twice. `@nestjs/authentication` requires a bearer token on every route unless it is marked `@Public()`, and `@nestjs/authorization` denies every route that doesn't declare `@Can(Policy, 'ability')`, `@Can.Anyone()` (any signed-in user) or `@Public()`.
- Mark public routes `@ApiSecurity({})` as well, so the OpenAPI document (which requires the bearer token document-wide, in `src/main.ts`) shows them as open.
- Staff-only abilities live in policy classes (`src/products/product.policy.ts`, `src/orders/order.policy.ts`), decorated with `@Policy()` and listed in their module's `providers`. The role is not in the token: `JwtAuth.validate()` loads the user, with their role, on every request.
- A customer's queries are scoped to `@CurrentUser('id')`. Another customer's order is a 404, like an order that doesn't exist.
- Rate limits (`@nestjs/throttler`) apply to every route per IP address, and per email and IP address wherever the request body names an account. Routes override them with `@Throttle()` and `@SkipThrottle()`.

### Validation

- Zod schemas go on the decorators: `@Body({ schema })`, `@Query({ schema })`, `@Param('id', { schema: z.uuid() })`. `StandardSchemaValidationPipe` is the global pipe, in `src/app.module.ts`. Export the DTO type with `z.infer` next to its schema.
- Optional fields are optional, not nullable: a `null` is a 400.
- Build update schemas with `.partial()` over the plain fields, not over a create schema with `.default()`s: a partial with defaults would fill in fields the client didn't send and overwrite them.

### Tests

- `npm run test:e2e` with `TEST_DATABASE_URL` pointing at a database of its own (`docker compose up -d` creates `shop_test`). Without it, the suites are skipped. They apply the migrations themselves, and truncate the tables, so never point them at a development database. The files share one database, so the script runs them with `--no-file-parallelism`.
- The tests run against a real PostgreSQL through a connection pool, because the guarantees are about concurrent requests: an in-process database with one connection never races. Requests go through `app.inject()`, and `PasswordHasher` is overridden with a cheaper scrypt cost.
- `test/checkout.e2e-spec.ts` protects the invariants above: only staff edit the catalog, ten customers racing for the last unit produce one order and a stock of 0, a cart checked out twice at once places one order, and cancelling puts the stock back and can't be repeated. A read-then-write stock check fails "sells the last unit exactly once".
- `test/refresh-token.store.e2e-spec.ts` runs the `@nestjs/authentication` contract suite against the Drizzle refresh-token store.
