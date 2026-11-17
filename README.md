# Stockflow — Inventory & Order Management

**Know what you have, what you sold and what to reorder, with every unit accounted for.**

Stockflow is a full-stack inventory and order management app for small retailers and warehouses. It tracks products and stock, records sales and purchase orders, and manages customers and suppliers. It shows live KPIs and keeps an audit trail of every stock change. Access is controlled by roles (Admin, Manager, Staff).

![React](https://img.shields.io/badge/React-18-20232a?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5-2d3748?logo=prisma)
![Tests](https://img.shields.io/badge/tests-14%20unit%20%C2%B7%2057%20integration-5b8a66)

> Every screen is backed by real API endpoints and database tables. Nothing is mocked.

---

## Contents
1. [Overview](#overview)
2. [Screenshots](#screenshots)
3. [Key features](#key-features)
4. [Tech stack](#tech-stack)
5. [Architecture](#architecture)
6. [Modules](#modules)
7. [Roles & permissions](#roles--permissions)
8. [Database design](#database-design)
9. [Business workflows](#business-workflows)
10. [Local setup](#local-setup)
11. [Demo data & accounts](#demo-data--accounts)
12. [Testing](#testing)
13. [Production deployment (Vercel + Render + Neon)](#production-deployment-vercel--render--neon)
14. [Environment variables](#environment-variables)
15. [API summary](#api-summary)
16. [Security](#security)
17. [Limitations & future improvements](#limitations--future-improvements)

---

## Overview

**The problem.** Small shops and warehouses often run inventory on spreadsheets. Stock counts drift because a sale is recorded but the stock column isn't updated. Nobody can explain why a number changed. Anyone with the file can change prices.

**What Stockflow does:**
- **Stock always matches the orders.** An order and its stock change succeed or fail together in one database transaction.
- **Every change is explained.** Each stock change is written to an append-only stock ledger that can't be edited.
- **Access is controlled.** Every request is checked against the user's role on the server.

**Who it's for:**
- **Store staff** recording sales.
- **Managers** handling purchasing, stock and fulfilment.
- **Owners or admins** managing the team and reviewing the audit log.

---

## Screenshots

> These screenshots come from a local run with the demo data from `npm run seed`. Replace them with captures from your own deployment if you like.

| Dashboard | Products |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Products](docs/screenshots/products.png) |
| **Sales orders** | **Order detail** |
| ![Orders](docs/screenshots/orders.png) | ![Order detail](docs/screenshots/order-detail.png) |
| **Customers** | **Stock movements** |
| ![Customers](docs/screenshots/customers.png) | ![Stock movements](docs/screenshots/stock-movements.png) |
| **Login** | **Audit log** |
| ![Login](docs/screenshots/login.png) | ![Audit log](docs/screenshots/audit-log.png) |

---

## Key features

- **Dashboard:**
  - Revenue and sales orders for the last 30 days, with % change against the previous 30 days.
  - Inventory value at cost and at retail, plus stock alerts.
  - A 30-day sales vs purchases chart, inventory value by category, top products and order counts by status.
  - A **Needs reordering** list, where one click opens a pre-filled purchase order.
- **Products:**
  - Create and edit products. Archiving is a soft delete, so order history is kept.
  - SKUs must be unique, and each product has a reorder level and a margin preview.
  - Search, filter by stock status, category and supplier, sort, paginate, and export to CSV.
- **Stock:**
  - Manual adjustments (count corrections, customer returns) with a note.
  - Stock can never go negative.
  - A read-only stock ledger, and a full history for each product.
- **Orders:**
  - Sales and purchase orders with multiple products.
  - Save as a **draft (pending)** or confirm immediately.
  - Confirm, fulfil and cancel, with rules for which status changes are allowed.
  - Exact decimal money maths.
- **Customers:**
  - Contact details and GSTIN.
  - Per-customer statistics: orders, total spent, average order value, last order, units bought.
  - Archive or delete safely, and create a customer straight from the sales form.
- **Suppliers & categories:** supplier details with the products they supply and recent purchase orders; categories with product counts.
- **Team & audit:**
  - Admins manage users and roles.
  - Managers and admins can read a plain-language audit log of sign-ins and every change.
- **Notifications:** a low-stock or out-of-stock alert is sent once, when a product first crosses its reorder level.
- **UX:**
  - Responsive layout, loading skeletons, empty and error states, toast messages and confirmation dialogs.
  - Filters and open panels are saved in the URL, so views can be shared.
  - Accessible focus states.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite 5 · Tailwind CSS 3 (token-based design system) · React Router 6 · Axios · Recharts · Lucide |
| Backend | Node.js 20 · Express 4 · TypeScript · Zod · Pino |
| Database | PostgreSQL 16 · Prisma 5 (Prisma Migrate, + parameterised raw SQL for reporting) |
| Auth | JWT access token (in memory) + refresh token (httpOnly cookie) · bcryptjs · role-based access control |
| Testing | Vitest · Supertest · integration tests against a real PostgreSQL database |
| Hosting | Vercel (frontend) · Render (API) · Neon (PostgreSQL) · Docker Compose locally |

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    SPA["React SPA<br/>(Vercel)"]
  end
  SPA -- "same-origin /api/*<br/>(Vercel rewrite)" --> V{{Vercel edge}}
  V -- "HTTPS proxy" --> API
  subgraph Render
    API["Express API<br/>helmet · CORS · rate limit<br/>auth → RBAC → Zod<br/>controllers → services"]
  end
  API -- "Prisma<br/>(TLS)" --> DB[("Neon PostgreSQL")]
```

**Request lifecycle:**
1. Global middleware runs first: Helmet, CORS, JSON body limit, cookie parser, Pino logging, rate limiter.
2. Each route then checks: `authenticate` (JWT) → `authorize(role)` → `validate(ZodSchema)`.
3. A **controller** translates the HTTP request into a function call.
4. A **service** applies the business rules and runs the transaction.
5. Prisma talks to PostgreSQL.
6. Any error goes to one central handler, which returns consistent JSON (`{ error, message, details? }`). Prisma errors become 404, 409 or 400 responses, never stack traces.

**Session design:**
- The access token (15 minutes) lives only in JavaScript memory.
- The refresh token sits in an `HttpOnly` cookie scoped to `/api/v1/auth`.
- The Axios client silently refreshes on a 401 response and retries the request.
- In production, the frontend calls `/api/*` on its own domain, and Vercel proxies those calls to Render. The cookie therefore stays **first-party**, which browsers that block third-party cookies require.

---

## Modules

| Backend module (`server/src/modules`) | Responsibility |
|---|---|
| `auth` | Login, refresh, logout, current user. Registration is switched off in production by default |
| `products` | Product create/edit/archive, search and filters, stock adjustments, per-product stock history |
| `orders` | Sales and purchase orders, pending drafts, status changes, stock effects |
| `customers` | Customer create/edit/archive/delete with statistics |
| `suppliers` · `categories` | Reference data with detail views |
| `stockMovements` | Read-only stock ledger |
| `dashboard` | KPI and reporting queries (SQL aggregates) |
| `activity` · `notifications` | Audit log, low-stock alerts |
| `users` | Team management (admin) |

The frontend is organised the same way: `pages/` (one per route), `features/` (forms and detail panels), `components/ui` (the design-system components), `api/` (typed endpoint functions) and `auth/` (session context and route guards).

---

## Roles & permissions

Every rule is enforced on the server. The UI also hides actions a role can't perform.

| Capability | Staff | Manager | Admin |
|---|:-:|:-:|:-:|
| View dashboard, products, orders, stock ledger, suppliers, customers | ✅ | ✅ | ✅ |
| Record sales (confirmed or draft); create and edit customers | ✅ | ✅ | ✅ |
| Create purchase orders (they add stock) | — | ✅ | ✅ |
| Confirm, fulfil or cancel orders | — | ✅ | ✅ |
| Create, edit and archive products; adjust stock; manage categories and suppliers | — | ✅ | ✅ |
| Archive or delete customers; view the audit log | — | ✅ | ✅ |
| Manage users and roles | — | — | ✅ |

---

## Database design

```mermaid
erDiagram
  USERS ||--o{ ORDERS : "creates"
  USERS ||--o{ STOCK_MOVEMENTS : "records"
  USERS ||--o{ ACTIVITY_LOGS : "performs"
  CATEGORIES |o--o{ PRODUCTS : "groups (SET NULL)"
  SUPPLIERS |o--o{ PRODUCTS : "supplies (SET NULL)"
  SUPPLIERS |o--o{ ORDERS : "purchase orders"
  CUSTOMERS |o--o{ ORDERS : "sales orders (RESTRICT)"
  ORDERS ||--|{ ORDER_ITEMS : "contains (CASCADE)"
  PRODUCTS ||--o{ ORDER_ITEMS : "ordered (RESTRICT)"
  PRODUCTS ||--o{ STOCK_MOVEMENTS : "ledger (RESTRICT)"
  ORDERS |o--o{ STOCK_MOVEMENTS : "caused by"
  PRODUCTS {
    int id PK
    text sku UK
    decimal unit_price
    decimal cost_price
    int quantity_in_stock
    int reorder_level
    bool is_active
  }
  ORDERS {
    int id PK
    text order_number UK
    enum type "SALE | PURCHASE"
    enum status "PENDING | CONFIRMED | FULFILLED | CANCELLED"
    int customer_id FK
    text customer_name "snapshot"
    int supplier_id FK
    decimal total_amount
  }
  STOCK_MOVEMENTS {
    int id PK
    int product_id FK
    int change_qty "+in / -out"
    enum reason "SALE | PURCHASE | ADJUSTMENT | RETURN"
    int reference_order_id FK
  }
  CUSTOMERS {
    int id PK
    text name
    text email
    text gstin
    bool is_active
  }
```

**Design decisions:**
- **Money** is `DECIMAL(12,2)` / `DECIMAL(14,2)` everywhere, and is calculated with Prisma's `Decimal` type, never JavaScript floating-point numbers.
- **`products.quantity_in_stock`** is a running total for fast reads. **`stock_movements`** is the append-only ledger behind it, and both are written in the same transaction. For every product, `SUM(change_qty) = quantity_in_stock`; the tests check this.
- **No negative stock:** sales and stock removals only decrement when enough stock remains, checked in the same statement. This is safe even when two sales happen at once.
- **Delete rules:**
  - Order items are deleted with their order.
  - Products, customers and users referenced by history can't be deleted; they're archived instead.
  - A database `CHECK` constraint stops purchase orders from referencing a customer.
- **Indexes:** unique SKU, email, category name and order number; plus indexes on order status, date and customer, product category and stock, and stock movements by product and date.

**Migrations** (`server/prisma/migrations`, applied in order):

| Migration | What it does |
|---|---|
| `…_prismadb01` | Initial schema |
| `…_add_customers` | Adds the `customers` table and `orders.customer_id`. **Backfills** one customer per distinct sales-order customer name, keeping `customer_name` as a snapshot |

---

## Business workflows

### Stock movement ledger
Every change to stock writes one ledger row with a reason:

| Event | Ledger row |
|---|---|
| Sale confirmed | `SALE −qty` |
| Purchase confirmed | `PURCHASE +qty` |
| Confirmed sale cancelled | `RETURN +qty` |
| Confirmed purchase cancelled | `ADJUSTMENT −qty` (refused if that stock has already been sold) |
| Manual adjustment / customer return | `ADJUSTMENT ±qty` / `RETURN +qty`, with a note in the audit log |

### Order lifecycle (sales & purchases)

```mermaid
stateDiagram-v2
  [*] --> PENDING: Save as draft (no stock change)
  [*] --> CONFIRMED: Record order (stock committed)
  PENDING --> CONFIRMED: Confirm (stock committed, re-checked)
  PENDING --> CANCELLED: Cancel (nothing to reverse)
  CONFIRMED --> FULFILLED: Delivered / received
  CONFIRMED --> CANCELLED: Cancel (stock reversed)
  FULFILLED --> [*]
  CANCELLED --> [*]
```

- **Stock is committed when an order is confirmed.** Confirmed sales reserve and deduct stock at once, so it can't be sold twice. *Fulfilled* records delivery or receipt and doesn't move stock again.
- **Pending orders are drafts or quotes.** They have no stock effect and don't count toward revenue. A pending sale can be saved even if stock is short, but confirming it re-checks stock and fails with a clear message if there isn't enough.
- **Purchase orders** take the item's cost price. **Sales** take its selling price. Each line stores its own unit price and line total.
- **Revenue and customer spending** count `CONFIRMED` and `FULFILLED` orders only.

### Customers
- A sale can be linked to a customer or recorded as a **walk-in**. The order keeps a snapshot of the customer's name, so renaming a customer never rewrites past orders.
- Customers with orders can only be **archived**. Archiving hides them and blocks new sales but keeps their history. Customers with no orders can be deleted.
- **Current limitation:** customers have no credit terms or multiple addresses yet.

---

## Local setup

### Prerequisites
- Node.js **18.18+** (20 LTS recommended) and npm
- Docker Desktop (for the local PostgreSQL), or any PostgreSQL 14+ database

### 1. Database (Docker)
```bash
docker compose up -d          # PostgreSQL 16 on localhost:5432 (user/password/db: stockflow)
```

### 2. Backend
```bash
cd server
cp .env.example .env          # set JWT secrets: openssl rand -hex 32 (twice)
npm install
npm run prisma:deploy         # apply all migrations
npm run seed                  # demo data (safe to re-run)
npm run dev                   # → http://localhost:4000  (health: /api/health)
```

### 3. Frontend
```bash
cd client
cp .env.example .env          # VITE_API_URL=http://localhost:4000/api/v1
npm install
npm run dev                   # → http://localhost:5173
```

### Useful scripts

**`server/`**

| Script | Description |
|---|---|
| `npm run dev` | Start the API with hot reload |
| `npm run build` / `npm start` | Run `prisma generate` + compile to `dist/` / run the compiled server |
| `npm run typecheck` | TypeScript check |
| `npm run prisma:migrate` | Create and apply a migration after editing `schema.prisma` (development) |
| `npm run prisma:deploy` | Apply existing migrations (any environment, never resets data) |
| `npm run prisma:status` / `prisma:validate` | Migration status / schema validation |
| `npm run seed` / `seed:prod` | Demo data from source (local Docker) / from the compiled build (uses `DATABASE_URL`, e.g. on Render) |
| `npm run neon:seed` | Demo data into Neon: loads `server/.env.neon`, verifies the target is the pinned Neon host + database over TLS, requires `SEED_DEMO_PASSWORD` |
| `npm test` / `test:integration` | Unit tests / integration tests (see [Testing](#testing)) |
| `npm run verify` | Validate schema, typecheck, unit tests, build |

**`client/`**

| Script | Description |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | TypeScript check |

> Never run `prisma migrate reset` or `prisma db push` against a database that holds real data. Use `prisma migrate deploy`.

---

## Demo data & accounts

`npm run seed` loads a realistic demo month. It is **idempotent**:
- Reference data is only created if it's missing, and existing records are never overwritten.
- The demo transactions run once only; a marker in the audit log records that they've been loaded.

All transactions go through the real order and stock services, so stock levels, ledger rows, low-stock alerts and audit entries are produced by the same code the app uses.

| Data | Contents |
|---|---|
| Users | One account per role (below) |
| Categories | Electronics, Accessories, Office Supplies, Stationery, Furniture |
| Suppliers | 4 suppliers with contact details and addresses |
| Products | 18 products priced in INR, each with a description, category, supplier, reorder level and opening stock |
| Customers | Tech Supplies, Stationary XYZ, Digital World, Office Essentials, Retail Hub (with fictitious GSTINs) |
| Orders | 13 orders over the last 30 days: 4 purchase orders (fulfilled, confirmed, pending) and 9 sales (fulfilled, confirmed, pending, **one cancelled**, one walk-in, several with multiple products) |
| Stock | A damaged-stock adjustment and a customer return; two products end below their reorder level, which triggers alerts |

**Demo accounts (local demonstration only):**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@stockflow.dev` | `Password123!` |
| Manager | `manager@stockflow.dev` | `Password123!` |
| Staff | `staff@stockflow.dev` | `Password123!` |

> ⚠️ `Password123!` is for **local development only**. Seeding a shared database (Neon or `NODE_ENV=production`) **requires** `SEED_DEMO_PASSWORD`: at least 12 characters, and the public password above is rejected. Production also requires `SEED_DEMO_DATA=true`. The seed never changes an existing user, so re-running it never resets a password. The deployed demo uses a private password.

---

## Testing

```bash
cd server
npm test                      # unit tests — no database needed (CI-friendly)
```

**Integration tests** run against an **isolated** PostgreSQL database. They empty every table, so the setup refuses to run unless the database name contains `test`:

```bash
docker exec stockflow-db createdb -U stockflow stockflow_test
DATABASE_URL=postgresql://stockflow:stockflow@localhost:5432/stockflow_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://stockflow:stockflow@localhost:5432/stockflow_test npm run test:integration
```

| Suite | Covers |
|---|---|
| `api.test.ts` (unit) | Health check, routing, validation errors, 401 for protected routes, Zod schemas |
| `env.test.ts` (unit) | Production config validation: placeholder, short or identical secrets, missing or localhost CORS origin, missing database URL |
| `workflows.int.test.ts` | Products, stock adjustments, concurrent sales never overselling, exact totals, order statuses, purchase-cancel protection, notifications, dashboard figures |
| `customers.int.test.ts` | Customer create/read/update/archive/delete, duplicate checks, statistics, walk-in sales, renaming without rewriting history, purchase-order rules |
| `production.int.test.ts` | Login, wrong/unknown credentials, inactive users, forged/expired JWTs, refresh, registration switch, role matrix, product validation, draft → confirm → fulfil/cancel stock rules, returns, ledger consistency, customer stats excluding drafts and cancellations, health check, **seed idempotency** |

Latest local run: **14/14 unit** and **57/57 integration** tests passing.

---

## Production deployment (Vercel + Render + Neon)

```mermaid
flowchart LR
  U[User] --> FE["Vercel<br/>client/ (static SPA)"]
  FE -- "/api/* rewrite" --> BE["Render Web Service<br/>server/ (Node 20)"]
  BE -- "DATABASE_URL (TLS)" --> PG[("Neon PostgreSQL")]
```

> The steps below set up your own deployment; the repository isn't deployed anywhere yet. All three providers have free tiers. Read the [free-tier notes](#free-tier-limitations) first.

### 1. Neon (PostgreSQL)

**With the Neon CLI** (how this repository was set up):
```bash
npm install -g neonctl && neon login
neon init -y --agent claude-code --org-id <org-id> --project-id <project-id> --no-config   # from the repo root
```
`neon init` links the project (`.neon/`) and writes `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) to the repo-root `.env.local`; both files are git-ignored.

Then copy the **direct** URL into `server/.env.neon` (also git-ignored), as `DATABASE_URL="…"`, and apply the migrations:
```bash
cd server
npm run neon:status      # shows pending migrations on Neon
npm run neon:migrate     # prisma migrate deploy against Neon (non-destructive)
```
Local development keeps using the Docker database in `server/.env`. Only the `neon:*` scripts read `.env.neon`.

**Or manually in the Neon Console:**
1. Create a project at [neon.tech](https://neon.tech) and pick a region close to your Render region. This project's database is in `ap-southeast-1` (Singapore), so choose Render's Singapore region.
2. Under **Connection Details**, copy the connection string. Use the **direct** (non-pooled) string; its host doesn't contain `-pooler`. Make sure it ends with `?sslmode=require`:
   ```
   postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/<db>?sslmode=require
   ```
3. This becomes `DATABASE_URL` on Render. Migrations are applied automatically by Render's build command.
   - To apply them from your own machine instead, run `DATABASE_URL="<neon url>" npx prisma migrate deploy` from `server/`.

> **Local Docker vs Neon:**
> - **Docker:** a disposable database on your machine, with no TLS and no data that matters.
> - **Neon:** managed, persistent and reached over TLS; it's the source of truth in production.
>
> Only ever run `migrate deploy` against Neon. If you outgrow the direct connection, switch the runtime URL to Neon's pooled `-pooler` endpoint (add `&pgbouncer=true`) and add a `directUrl` for migrations in `schema.prisma`.

### 2. Render (API)
**Option A, using the Blueprint:** New → **Blueprint** → select this repository. Render reads [`render.yaml`](render.yaml). Fill in the variables it prompts for.

**Option B, manually:** New → **Web Service** → connect the repository, then:

| Setting | Value |
|---|---|
| Root directory | `server` |
| Runtime | Node (set `NODE_VERSION=20`) |
| Build command | `npm ci --include=dev && npm run build && npx prisma migrate deploy` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Set the environment variables listed under [Backend (Render)](#backend-render).

> `--include=dev` is required. With `NODE_ENV=production`, a plain `npm ci` skips TypeScript and the Prisma CLI, which the build needs.

**Optional: seed the public demo**, once, from the Render **Shell**:
```bash
SEED_DEMO_DATA=true SEED_DEMO_PASSWORD='<choose-a-demo-password>' npm run seed:prod
```
Render's free instances have no Shell. Seed Neon from your machine instead (from `server/`):
```bash
SEED_DEMO_PASSWORD='<choose-a-demo-password>' npm run neon:seed
```

### 3. Vercel (frontend)
1. Edit [`client/vercel.json`](client/vercel.json): replace `https://YOUR-RENDER-SERVICE.onrender.com` with your Render URL, then commit.
2. In Vercel: New Project → import the repository, then use these settings:

   | Setting | Value |
   |---|---|
   | Root directory | `client` |
   | Framework | Vite |
   | Build command | `npm run build` |
   | Output directory | `dist` |

3. **Environment variables:** none are needed with the `/api` rewrite. The app calls `/api/v1` on its own domain.
4. Deploy, then set `CLIENT_ORIGIN` on Render to your Vercel URL and redeploy the API.

`vercel.json` also adds the SPA fallback, so refreshing a page like `/products` works, plus security headers and long-term caching for the hashed assets.

> **Direct mode (alternative):** you can set `VITE_API_URL=https://<render>.onrender.com/api/v1` on Vercel instead of using the rewrite. In that case:
> - set `TRUST_PROXY=1` on Render;
> - expect some sessions to drop on page reload, because some browsers block the refresh cookie as third-party;
> - remove the `/api` rewrite from `vercel.json` if you don't use it.

### 4. Verify the deployment
- `https://<render>.onrender.com/api/health` should return `{"status":"ok","database":"up",…}`.
- Open the Vercel URL, sign in, and reload a deep link such as `/orders`. You should stay signed in.
- Create a sale and check that the product's stock and the stock ledger update.

### Free-tier limitations
- **Render (free web service):** sleeps after about 15 minutes idle, so the first request then takes 30–60 seconds. It also has a monthly limit on running hours, and builds are slower.
- **Neon (free):** compute suspends when idle and wakes in about a second. Storage and compute hours are capped. A small number of projects and branches are allowed.
- **Vercel (Hobby):** for personal, non-commercial projects, with bandwidth and build-time limits.

Limits change; check each provider's current pricing page. None of this setup needs billing enabled.

---

## Environment variables

### Backend (Render)

| Variable | Required | Description |
|---|:-:|---|
| `NODE_ENV` | ✅ | `production` |
| `DATABASE_URL` | ✅ | Neon connection string with `sslmode=require` |
| `JWT_ACCESS_SECRET` | ✅ | ≥ 32 random characters (`openssl rand -hex 32`); different from the refresh secret |
| `JWT_REFRESH_SECRET` | ✅ | ≥ 32 random characters |
| `CLIENT_ORIGIN` | ✅ | Your Vercel URL (comma-separated for several). `FRONTEND_URL` is accepted as an alias |
| `TRUST_PROXY` | — | Number of proxies in front of the API: `2` with the Vercel rewrite, `1` in direct mode |
| `ALLOW_REGISTRATION` | — | `false` by default in production |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS` | — | Token lifetimes (`15m` / `7`) |
| `PORT` / `HOST` | — | Injected by Render / `0.0.0.0` |
| `SEED_DEMO_DATA` / `SEED_DEMO_PASSWORD` | — | Only for running the demo seed in production |

The API **refuses to start** in production if any of these is true:
- a required variable is missing;
- a secret is shorter than 32 characters, looks like a placeholder, or both secrets are the same;
- `CLIENT_ORIGIN` is missing or points at localhost.

### Frontend (Vercel)

| Variable | Required | Description |
|---|:-:|---|
| `VITE_API_URL` | — | Only for direct mode. Every `VITE_*` value ends up in the browser bundle, so never put secrets here |

`.env` files are git-ignored. Only `.env.example` templates are committed.

---

## API summary

- **Base URL:** `/api/v1`.
- **Auth:** protected routes need `Authorization: Bearer <accessToken>`.
- **Errors:** `{ "error": "CODE", "message": "…", "details"?: … }`.

| Area | Endpoints |
|---|---|
| Health | `GET /api/health` (readiness, checks the database) · `GET /health` (liveness) |
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/register` (when enabled) |
| Products | `GET /products?search&categoryId&supplierId&stock=in\|low\|out&sort&order&page&limit` · `GET /products/low-stock` · `GET /products/:id` · `GET /products/:id/movements` · `POST /products` · `PATCH /products/:id` · `DELETE /products/:id` (archive) · `POST /products/:id/adjust` |
| Orders | `POST /orders` (`status: "PENDING" \| "CONFIRMED"`) · `GET /orders?type&status&search&customerId&page&limit` · `GET /orders/:id` · `PATCH /orders/:id/status` |
| Customers | `GET /customers?search&status&sort&order&page&limit` · `GET /customers/:id` · `POST /customers` · `PUT /customers/:id` · `POST /customers/:id/archive` · `POST /customers/:id/restore` · `DELETE /customers/:id` |
| Suppliers & categories | `GET/POST /suppliers` · `GET/PATCH /suppliers/:id` · `GET/POST /categories` · `PATCH /categories/:id` |
| Reporting & admin | `GET /dashboard/summary` · `GET /stock-movements` · `GET /activity` · `GET /notifications` · `PATCH /notifications/:id/read` · `PATCH /notifications/read-all` · `GET/POST /users` · `PATCH /users/:id` |

**Example: record a sale.** This needs `"status": "PENDING"` to save a draft instead.
```http
POST /api/v1/orders
Authorization: Bearer <token>
Content-Type: application/json

{ "type": "SALE", "customerId": 1, "items": [{ "productId": 1, "quantity": 3 }] }

201 → { "data": { "orderNumber": "SO-000010", "status": "CONFIRMED", "totalAmount": "2397", … } }
409 → { "error": "INSUFFICIENT_STOCK", "message": "Not enough stock for \"Wireless Mouse\"", "details": { "available": 1, "requested": 3 } }
```

---

## Security

- **Passwords:** hashed with bcrypt (cost 12). Login takes the same time whether or not the email exists, and failures return a generic message, so accounts can't be discovered.
- **Tokens:**
  - The access token stays in memory, never in `localStorage`.
  - The refresh cookie is `HttpOnly`, `Secure` and `SameSite=None` in production, and scoped to `/api/v1/auth`.
  - Access and refresh tokens use separate secrets.
- **Authorisation:** a server-side role check on every route. Admins can't demote or deactivate themselves.
- **Validation:** Zod schemas on every request body and query. IDs are validated, so malformed input returns 400.
- **Injection:** Prisma's parameterised queries throughout. Raw SQL uses tagged templates, and sort columns are whitelisted.
- **Transport and headers:** Helmet, a CORS allow-list taken from the environment, a 100 KB request-body limit, and rate limits (120 requests per minute per IP, and 20 login attempts per 15 minutes) that see real client IPs through `trust proxy`.
- **No information leaks:**
  - Unexpected errors return a generic 500, and details are logged on the server only.
  - Logs redact `Authorization` headers and cookies.
  - The health check exposes no credentials or hostnames.
- **Configuration:** secrets come only from environment variables and are validated at startup. Public registration is off in production. The demo seed needs explicit opt-in in production.

---

## Limitations & future improvements

**Known limitations:**
- **Refresh tokens can't be revoked.** Nothing is stored on the server, so logging out only clears the cookie, and a role change takes effect at the user's next refresh (within 15 minutes). A refresh-token table would fix this.
- **The order form lists 100 records at most:** the first 100 products and the first 100 active customers. Larger catalogues need a searchable picker.
- **Rate limits are kept in memory per instance.** Scaling to several instances would need a shared store such as Redis.
- **Revenue isn't split by fulfilment date.** It's grouped by the order's creation date.

**Roadmap:**
- Searchable pickers, CSV import, product images, barcode scanning.
- Multi-warehouse stock, and stock reserved by confirmed-but-unfulfilled orders shown separately from stock on hand.
- Top customers on the dashboard, and real-time notifications (WebSockets).
- GitHub Actions CI running unit and integration tests against a temporary PostgreSQL database.

---

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.
