# E-commerce backend with NestJS

This is the finished application of the tutorial [Build an e-commerce backend in Node.js](https://docs.nestjs.com/tutorials/ecommerce-backend) in the NestJS documentation. The tutorial builds it step by step and explains each decision; this repository is the result.

## What it does

- A product catalog that anyone can browse and search, and only staff can create and edit. [`@nestjs/authorization`](https://docs.nestjs.com/security/authorization) denies any route that doesn't declare who may call it.
- A cart per customer, priced at the current prices, with a flag on each line that can't be bought right now.
- A checkout that runs in one database transaction: it takes the cart, takes the stock with a conditional `UPDATE`, and records the prices, or changes nothing. Ten customers racing for the last unit get exactly one order, and a double-clicked checkout places one order.
- Cancellation by the customer, which puts the stock back, and shipping by staff. Of a cancel and a ship racing for the same order, one wins and the other gets a 409.
- Prices in integer cents, and prices copied into each order, so later price changes don't rewrite past orders.
- Sign-up and sign-in with access and refresh tokens, rate limiting, security headers, OpenAPI and health checks, from the [JWT tutorial](https://docs.nestjs.com/tutorials/rest-api-jwt-authentication) it starts from.

## Run it

You need Node.js 22 or later, and Docker for PostgreSQL.

```bash
git clone https://github.com/nestjs/example-ecommerce-backend.git
cd example-ecommerce-backend
npm install
cp .env.example .env              # then set JWT_SECRET to the output of: openssl rand -base64 32
docker compose up -d
npm run db:migrate
npm run start:dev
```

The API listens on http://localhost:3000, with Swagger UI at http://localhost:3000/docs.

Sign-up creates customers. To make a user staff, update their row in the database:

```bash
docker compose exec postgres psql -U postgres -d shop -c "UPDATE users SET role = 'staff' WHERE email = 'sam@example.com'"
```

The role is read on every request, so the user's existing tokens pick it up on their next call. The tutorial's [Try it](https://docs.nestjs.com/tutorials/ecommerce-backend#try-it) section walks through a session with `curl`.

## Endpoints

| Endpoint | Who | Tutorial section |
| --- | --- | --- |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke` | anyone | [Start from the JWT API](https://docs.nestjs.com/tutorials/ecommerce-backend#start-from-the-jwt-api) |
| `GET /me` | signed in | [Start from the JWT API](https://docs.nestjs.com/tutorials/ecommerce-backend#start-from-the-jwt-api) |
| `GET /health/live`, `GET /health/ready` | anyone | [Start from the JWT API](https://docs.nestjs.com/tutorials/ecommerce-backend#start-from-the-jwt-api) |
| `GET /products`, `GET /products/:id` | anyone | [Let staff manage the catalog](https://docs.nestjs.com/tutorials/ecommerce-backend#let-staff-manage-the-catalog) |
| `POST /products`, `PATCH /products/:id` | staff | [Let staff manage the catalog](https://docs.nestjs.com/tutorials/ecommerce-backend#let-staff-manage-the-catalog) |
| `GET /cart`, `PUT /cart/items/:productId`, `DELETE /cart/items/:productId` | signed in | [Keep a cart](https://docs.nestjs.com/tutorials/ecommerce-backend#keep-a-cart) |
| `POST /orders` (checkout), `GET /orders`, `GET /orders/:id` | signed in | [Check out without overselling](https://docs.nestjs.com/tutorials/ecommerce-backend#check-out-without-overselling) |
| `POST /orders/:id/cancel` | the order's owner | [Cancel and ship orders](https://docs.nestjs.com/tutorials/ecommerce-backend#cancel-and-ship-orders) |
| `POST /orders/:id/ship` | staff | [Cancel and ship orders](https://docs.nestjs.com/tutorials/ecommerce-backend#cancel-and-ship-orders) |
| `GET /docs` | anyone | Swagger UI |

## Layout

| Path | What it holds |
| --- | --- |
| `src/main.ts` | bootstrap on the Node adapter: logger, security headers, CORS, Swagger UI, shutdown hooks |
| `src/app.module.ts` | NestJS Observe, config, database, authentication, authorization, rate limiting, validation pipe |
| `src/config.ts` | the Zod schema of the environment variables |
| `src/database/schema.ts` | Drizzle tables: users, refresh_tokens, products, cart_items, orders, order_items |
| `src/auth/`, `src/users/` | sign-up, sign-in and tokens, from the JWT tutorial; users have a `customer` or `staff` role |
| `src/products/` | the catalog and its policy |
| `src/cart/` | the cart |
| `src/orders/` | checkout, cancel and ship, and the shipping policy |
| `src/health/` | liveness and readiness |
| `drizzle/` | the generated migration |
| `test/` | e2e tests against PostgreSQL |

## Tests

The tests run against a real PostgreSQL server, since the guarantees they check are about concurrent requests. `docker compose up -d` creates a `shop_test` database for them. They truncate its tables, so never point them at your development database:

```bash
TEST_DATABASE_URL=postgres://postgres:shop@localhost:5432/shop_test npm run test:e2e
```

- `test/checkout.e2e-spec.ts`: only staff edit the catalog, the last unit sells exactly once to ten racing customers, a cart checked out twice at once places one order, and cancelling puts the stock back.
- `test/refresh-token.store.e2e-spec.ts`: the refresh-token store against the contract suite of `@nestjs/authentication`.

Without `TEST_DATABASE_URL`, both files are skipped. The tests apply the migrations themselves.

## Stack

[NestJS](https://nestjs.com) 12 on the Node adapter, [Zod](https://zod.dev) validation, [Drizzle](https://docs.nestjs.com/data/drizzle) and PostgreSQL 17, [`@nestjs/authentication`](https://docs.nestjs.com/security/authentication), [`@nestjs/authorization`](https://docs.nestjs.com/security/authorization), [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting), [`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction), [`@nestjs/terminus`](https://docs.nestjs.com/reliability/terminus), [NestJS Observe](https://docs.nestjs.com/observability/overview), and Vitest.

## Production

Read the tutorial's [production checklist](https://docs.nestjs.com/tutorials/ecommerce-backend#production-checklist) first.

The app is wired to [NestJS Observe](https://docs.nestjs.com/observability/overview), which records every request with a trace of its spans, SQL statements included. It sends nothing until it has a key pair: `npx @nestjs/observe link` writes `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` into `.env`. Give production its own key pair, set in the platform's environment rather than in a `.env` file.

## License

MIT
