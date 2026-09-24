# Order Management System

A full-stack system for managing customer orders end to end: a product
catalog with live stock tracking, a customer directory, and orders that move
through a controlled lifecycle (`PENDING → PAID → SHIPPED → DELIVERED`, with
cancellation before shipment). Built in TypeScript across the stack to
demonstrate production backend and full-stack engineering practices.

**Stack:** NestJS · Prisma · PostgreSQL · React · Vite · Docker

---

## Contents

[Quick start](#quick-start) · [Tech stack](#tech-stack) · [Architecture](#architecture) ·
[Features](#features) · [API](#api) · [Testing](#testing) · [Deployment](#deployment) ·
[Project structure](#project-structure) · [Design decisions](#design-decisions)

## Quick start

Requires Docker.

```bash
docker compose up --build -d
```

No manual migration or seed step — on first start the backend automatically
syncs the database schema and seeds demo data. Give it ~20 seconds
(`docker compose logs -f backend` to watch), then:

| | |
|---|---|
| App | http://localhost:5173 |
| API | http://localhost:3000/api |
| Swagger | http://localhost:3000/api/docs |
| Login | `admin@oms.local` / `Admin123!` |

Running without Docker: see [Local development](#local-development) below.

## Tech stack

| | |
|---|---|
| **Backend** | NestJS 10, Prisma ORM, PostgreSQL, JWT auth (Passport + bcrypt), class-validator, Swagger/OpenAPI |
| **Frontend** | React 18, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS |
| **Testing** | Jest + Supertest (unit and e2e) |
| **Infra** | Docker (multi-stage builds), docker-compose, GitHub Actions CI |

## Architecture

```
React SPA  ──HTTPS/JSON──▶  NestJS REST API  ──SQL──▶  PostgreSQL
(Vite, TanStack Query)      (Prisma, JWT auth)
```

The backend follows a standard layered structure: **Controllers** (HTTP +
DTO validation) → **Services** (business logic, DB transactions) → **Prisma**
(persistence). Each domain — `auth`, `customers`, `products`, `orders` — is
an isolated NestJS module; cross-cutting concerns (auth guard, role guard,
exception filter) live under `src/common`.

## Features

- **Auth** — JWT register/login, two roles (`ADMIN`, `STAFF`); catalog and
  destructive actions are admin-only.
- **Customers** — CRUD, paginated and searchable.
- **Products** — CRUD, paginated/searchable, stock tracking, and a
  discontinue/reactivate toggle (soft-delete — a product referenced by past
  orders is never hard-deleted).
- **Orders** — creating an order validates stock and product status,
  decrements stock, and computes the total server-side, all inside one DB
  transaction (a failure anywhere rolls back the whole order). Status moves
  through an explicit state machine; illegal transitions (skipping a step,
  cancelling a shipped order) are rejected with `400`, and cancelling a
  `PENDING`/`PAID` order atomically restocks its items.

## API

Full interactive docs (request/response schemas, try-it-out console) at
**`/api/docs`** once the backend is running.

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Create a user | Public |
| POST | `/api/auth/login` | Log in, get a JWT | Public |
| GET | `/api/auth/me` | Current user | JWT |
| GET / POST | `/api/customers` | List / create | JWT |
| GET / PATCH / DELETE | `/api/customers/:id` | Read / update / delete | JWT (delete: admin) |
| GET / POST | `/api/products` | List / create | JWT (create: admin) |
| GET / PATCH / DELETE | `/api/products/:id` | Read / update / discontinue | JWT (write: admin) |
| GET / POST | `/api/orders` | List (filter by status/customer) / create | JWT |
| GET | `/api/orders/:id` | Read an order | JWT |
| PATCH | `/api/orders/:id/status` | Transition status | JWT |

## Testing

```bash
cd backend
npm run test          # unit tests — mocked Prisma client
npm run test:cov       # with coverage
```

Covers the order total/stock logic, the status state machine (legal/illegal
transitions, restocking on cancellation), auth password hashing, and CRUD
error handling (duplicate → `409`, missing → `404`).

```bash
docker compose up -d db && npx prisma db push   # from backend/, point at a test DB
npm run test:e2e
```

Runs the full order lifecycle against a real database: register → login →
create customer/product → place an order → verify stock decremented →
reject over-stock and illegal transitions → advance to `DELIVERED`.

Both suites, plus `lint`/`build` for both apps, run in CI on every push
(`.github/workflows/ci.yml`).

## Deployment

A [Render](https://render.com) Blueprint (`render.yaml`) is included, defining
the database, backend, and frontend as infrastructure-as-code:

1. Push this repo to GitHub.
2. On Render: **New → Blueprint**, select the repo. Render provisions a
   Postgres instance and both Docker services from `render.yaml`.
3. After the first deploy, if either service's URL differs from the default
   (`oms-backend.onrender.com` / `oms-frontend.onrender.com`), update
   `CORS_ORIGIN` (backend) and `VITE_API_URL` (frontend) in `render.yaml` — or
   directly in the Render dashboard — to match, then redeploy both.

The backend's `docker-entrypoint.sh` syncs the schema and seeds demo data on
every boot, so no manual migration step is needed after deploying either.

Any other Docker-friendly host (Railway, Fly.io, a VPS with `docker compose`)
works the same way — the two Dockerfiles and `docker-compose.yml` are the
source of truth; `render.yaml` is just one platform's wiring on top of them.

## Local development

<details>
<summary>Running backend and frontend directly with Node (no Docker for the app itself)</summary>

```bash
# Database
docker compose up -d db   # add `ports: ['5433:5432']` under db: in docker-compose.yml
                           # first if you want to reach it from the host

# Backend
cd backend
cp .env.example .env
npm install
npx prisma db push
npm run prisma:seed       # optional
npm run start:dev         # http://localhost:3000/api

# Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```
</details>

## Project structure

```
backend/
  prisma/           schema.prisma, seed.ts
  src/
    auth/           register, login, JWT strategy/guard
    customers/       product catalog CRUD
    products/        product catalog CRUD, stock
    orders/          order creation + status lifecycle
    common/           guards, decorators, exception filter
  test/             e2e tests

frontend/
  src/
    pages/          Login, Orders, Products, Customers
    components/      Layout, StatusBadge, ProtectedRoute
    context/          AuthContext (JWT session)
    lib/              API client, formatters
```

## Design decisions

- **NestJS** for DI, module boundaries, and first-class test tooling
  (`Test.createTestingModule`) — the way mid-size backend teams structure
  services in production.
- **Prisma** for compile-time-checked queries and migrations, with raw
  `$transaction` calls where atomicity matters (order creation, status changes).
- **Money as integer cents** (`priceCents`, `totalCents`) — avoids
  floating-point rounding bugs common in commerce systems.
- **Server-computed totals and stock** — the API never trusts a client-sent
  price or total; both are derived from the database inside a transaction.
- **Explicit state machine for order status** (`ALLOWED_TRANSITIONS` in
  `order-status.util.ts`) — transitions are data, not scattered
  conditionals, so the lifecycle is easy to read, test, and extend.
- **Soft-delete for products** — a product referenced by historical orders
  is deactivated (`isActive: false`), never removed, so order history stays intact.

---

**Author:** Shamil Mustafin
