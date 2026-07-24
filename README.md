# Mini Order & Inventory API

A small backend service for managing products, users, and orders, built with
Node.js, Express, and MongoDB (Mongoose). Built for the Vrit Jobs backend
assessment.

## Tech Stack

- **Node.js + Express** — REST API
- **MongoDB + Mongoose** — data store / ODM
- **JWT (jsonwebtoken)** — authentication
- **bcrypt** — password hashing
- **Joi** — request validation
- **helmet, cors** — security middleware
- **Jest + Supertest + mongodb-memory-server** — testing
- **Docker + docker-compose** — containerization

---

## Quick Start

```bash
git clone <this-repo>
cd order-inventory-api
cp .env.example .env
docker-compose up
```

That's it — the API will be available at `http://localhost:3000`, and
MongoDB runs alongside it in its own container. No manual DB setup needed.

Health check: `GET http://localhost:3000/health`

### Creating an admin account

Public signup (`POST /api/auth/signup`) intentionally **never** accepts a
`role` field — every self-registered user is a `customer`. This avoids an
obvious privilege-escalation bug (anyone could otherwise sign up as an
admin). To get an admin account for testing:

```bash
docker-compose exec app node src/scripts/seedAdmin.js admin@example.com StrongPassword123
```

This creates the user if they don't exist, or promotes them to admin if
they do.

### Running locally without Docker

```bash
npm install
cp .env.example .env   # then point MONGO_URI at a local/Atlas MongoDB instance
npm run dev
```

### Running tests

```bash
npm install
npm test
```

Tests spin up an in-memory MongoDB replica set (`mongodb-memory-server`) —
no external database needed. First run will download a MongoDB binary,
which requires network access.

---

## Design Decisions

### Schema / document design

- **User**: email (unique, indexed), bcrypt-hashed password (excluded from
  query results by default via `select: false`), role (`admin` |
  `customer`).
- **Product**: name, price, stock, category. Indexed on `category` (and a
  compound `{ category, createdAt }` index) since listing/filtering by
  category is the primary read pattern.
- **Order**: references the user, embeds line items (`product` ref,
  `quantity`, and a **`priceAtOrder` snapshot** so historical order totals
  aren't affected if a product's price later changes), plus a computed
  `totalAmount` and a `status` enum (`pending` / `confirmed` / `cancelled`).
  Indexed on `{ user, status, createdAt }` to support "list my orders,
  filtered by status."

Line items are embedded in the Order document rather than stored as a
separate collection — they're always read and written together with their
parent order, have no independent lifecycle, and there's no need to query
them outside the context of an order, so embedding avoids unnecessary joins
(`$lookup`/`populate`) for the common read path.

### Handling the stock race condition (core focus)

**Approach chosen: atomic conditional update per line item**
(`Product.findOneAndUpdate({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })`),
**not** a multi-document transaction.

**Why this is safe under concurrency:** MongoDB guarantees that a single
document's `findOneAndUpdate` — including evaluating the filter and
applying the update — is atomic. If two requests race to buy the last unit
of a product, only one of them will find a document matching
`stock: { $gte: qty }` at the moment it executes; the other's filter simply
won't match against the now-lower stock value, and the operation returns
`null`. There's no read-then-write gap in application code where two
processes could both read `stock: 1` and both decide it's safe to proceed —
the check and the mutation happen as one indivisible operation inside
MongoDB itself.

**Why not a transaction?** A multi-document transaction (via
`session.withTransaction()`) is the more "textbook" way to get all-or-
nothing atomicity across multiple writes, but:

- It requires a replica set (extra deployment complexity — a standalone
  `mongod` can't run transactions).
- It holds locks and keeps a session open for the duration of the whole
  order, which adds latency and increases the chance of write conflicts
  under load.
- Here, each line item only touches **one** Product document. The atomic
  conditional update gives the identical correctness guarantee per item, at
  a fraction of the overhead of a transaction.

**The trade-off I accepted:** because each item is decremented
independently (not wrapped in one atomic transaction across the whole
order), if item 2 of 3 fails due to insufficient stock, item 1's decrement
has already committed. I handle this with **explicit compensating rollback**
— see `src/services/orderService.js` (`decrementStockOrRollback` /
`rollback`) — which restores stock for every item that succeeded before the
failure. This isn't as airtight as a DB-level rollback (there's a brief
window where the order is only "partially reserved"), but for this scale
and use case it's a reasonable, well-understood trade-off, and I'd revisit
it in favor of transactions if orders routinely spanned many line items or
correctness during that brief window became critical.

**Other edge cases handled:**
- **Duplicate product in one order**: line items are merged (quantities
  summed) *before* any stock is touched, so the same product is never
  decremented twice in separate operations for one order.
- **Non-existent product**: returns `404 PRODUCT_NOT_FOUND` and rolls back
  anything already decremented in that order.
- **Invalid quantity** (zero, negative, non-integer): rejected at the Joi
  validation layer before it reaches the service.

### Why Mongoose over the native driver

Mongoose was chosen for schema-level validation (required fields, min/max,
enums) enforced at the model layer rather than scattered across route
handlers, plus convenient population for order → product references. The
core stock-decrement logic still bypasses Mongoose's abstractions and uses
`findOneAndUpdate` directly with an explicit atomic filter — that part is
hand-written, not delegated to any library default.

---

## API Endpoints

Base URL: `http://localhost:3000/api`

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/auth/signup` | No | – | Register a new user (always created as `customer`) |
| POST | `/auth/login` | No | – | Log in, returns a JWT |
| GET | `/products` | No | – | List products. Query: `page`, `limit`, `category` |
| GET | `/products/:id` | No | – | Get a single product |
| POST | `/products` | Yes | admin | Create a product |
| PUT | `/products/:id` | Yes | admin | Update a product |
| DELETE | `/products/:id` | Yes | admin | Delete a product |
| POST | `/orders` | Yes | customer | Place an order (`{ items: [{ productId, quantity }] }`) |
| GET | `/orders` | Yes | any | List orders — own orders for customers, all orders for admins. Query: `page`, `limit`, `status` |
| GET | `/orders/:id` | Yes | any | Get a single order (owner or admin only) |
| PATCH | `/orders/:id/cancel` | Yes | any | Cancel an order and restore stock (owner or admin only) |
| GET | `/health` | No | – | Health check |

### Example requests

**Signup**
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"password123"}'
```

**Create a product (admin)**
```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -d '{"name":"Widget","price":9.99,"stock":100,"category":"tools"}'
```

**Place an order**
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CUSTOMER_JWT>" \
  -d '{"items":[{"productId":"<PRODUCT_ID>","quantity":2}]}'
```

### Error response format

All errors follow a consistent shape:

```json
{
  "error": {
    "message": "Insufficient stock for product Widget (available: 2, requested: 5)",
    "code": "INSUFFICIENT_STOCK"
  }
}
```

---

## Project Structure

```
src/
  models/        # Mongoose schemas (User, Product, Order)
  routes/        # Express route definitions
  controllers/   # Thin HTTP layer - parses req, calls services, shapes response
  services/      # Business logic (order concurrency logic lives here)
  middleware/    # auth, role guard, validation, central error handler
  validators/    # Joi schemas per resource
  utils/         # AppError, catchAsync
  scripts/       # seedAdmin.js
  config/        # env loading, DB connection
  app.js         # Express app wiring
  server.js      # entrypoint
tests/
  auth.test.js
  product.test.js
  order.test.js   # includes the concurrency/race-condition test
  setup.js        # in-memory MongoDB helper
```

---

## Security Notes

- Passwords hashed with bcrypt (configurable salt rounds via env var), never
  returned in API responses.
- JWT-based auth; role checked via middleware (`requireRole`) at the route
  level, not inside controllers.
- `helmet()` and `cors()` applied globally.
- Public signup cannot self-assign the `admin` role.
- List/filter query params are whitelisted before being used to build a
  Mongo filter object — raw `req.query` is never spread directly into a
  query, which would otherwise allow operator injection
  (e.g. `?stock[$gt]=`).
- Request body size limited (`10kb`) as a basic guard against oversized
  payloads.
- No secrets committed — `.env` is gitignored; `.env.example` documents the
  required variables.

## Known Limitations / What I'd Add With More Time

- No refresh-token flow (JWTs are short-lived access tokens only).
- No rate limiting (listed as a stretch goal — would add
  `express-rate-limit` on auth endpoints in particular).
- No structured logging (`pino`/`winston`) or request tracing.
- Order cancellation is included but doesn't yet handle a
  cancellation-window policy (e.g. "can't cancel after N hours").
