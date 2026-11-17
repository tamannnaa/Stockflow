# stockflow — Inventory & Order Management

A full-stack inventory and order management app for small retailers and warehouses. Track products and stock levels, record sales and purchase orders, manage customers and suppliers, and see live KPIs, all with role-based access and a complete audit trail of every stock change.

![React](https://img.shields.io/badge/React-18-20232a?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5-2d3748?logo=prisma)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06b6d4?logo=tailwindcss&logoColor=white)

> Every feature is backed by real API endpoints and database tables. Nothing in the UI is mocked.

---

## Table of contents
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Roles & permissions](#roles--permissions)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Scripts](#scripts)
- [API reference](#api-reference)
- [Design system](#design-system)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## Features

### Dashboard
- KPI cards: revenue and sales orders for the last 30 days, with % change against the previous 30 days; inventory value at cost and at retail; stock alerts.
- A 30-day **sales vs purchases** chart with hover tooltips.
- Inventory value by category, top products by units sold, and order counts by status.
- A **"Needs reordering"** list, where one click opens a pre-filled purchase order.
- Recent orders that link straight to their details.

### Inventory
- **Products:**
  - Create, edit and archive products. Archiving is a soft delete, so order history is kept.
  - SKUs must be unique.
  - Each product can have a category, a preferred supplier, a reorder level and a margin preview.
  - Search, filter by stock status (in / low / out), category and supplier, sort columns, paginate, and export to CSV.
- **Stock adjustments:** add or remove stock with a reason (count correction or customer return) and a note. Stock can never go below zero.
- **Stock movements:** a read-only ledger of every stock change (sale, purchase, return, adjustment), with each product's full history shown on its detail panel.
- **Categories:** create and rename, with product counts.

### Orders
- **Sales and purchase orders with multiple products,** each with a live total.
- **Atomic stock changes:** the order, its items, the stock update and the ledger entries succeed or fail together in one database transaction.
- **No overselling, even under concurrent sales:** stock is only decremented when enough remains, checked in the same database statement.
- **Status workflow** `CONFIRMED → FULFILLED` or `CANCELLED`, with validated transitions:
  - Cancelling a sale returns its stock.
  - A purchase can't be cancelled once its stock has been sold.
- **Exact money maths:** prices and totals use `DECIMAL` end to end, never floating-point numbers.
- **Low-stock and out-of-stock notifications:** sent once, when a product first crosses its reorder level.

### Customers
- Customer records with company, email, phone, address and GSTIN (validated).
- Duplicate email, duplicate GSTIN, or the same name at the same company is rejected.
- **Per-customer statistics:** total orders, total spent, average order value, first and last order, units purchased. Cancelled orders are excluded.
- **In the sales form:** pick an existing customer, create a new one without leaving the form, or record a walk-in sale.
- **Safe removal:** customers with orders can only be archived, which hides them and blocks new sales but keeps their history. Customers with no orders can be deleted.
- Each order keeps a snapshot of the customer's name at the time of sale, so renaming a customer never rewrites history.

### Suppliers
- Create and edit suppliers.
- A supplier panel shows the products they supply, with stock levels, and their recent purchase orders.
- One-click **New purchase order** from a supplier.

### Team, audit & notifications
- **Team (admin only):** add members with a role, change roles, deactivate or reactivate accounts. Admins can't demote or deactivate themselves.
- **Audit log (managers and admins):** sign-ins and changes to products, stock, orders, customers, suppliers, categories and users, in plain language and filterable by type.
- **Notifications bell:** unread count, mark one or all as read.

### UX
- Responsive layout: a collapsible sidebar on mobile, and tables that hide less important columns on narrow screens.
- Loading skeletons, empty states, error states with retry, toast messages, and confirmation dialogs before destructive actions.
- Filters, open panels and forms are saved in the URL, so views can be bookmarked and shared (e.g. `/products?stock=low`).
- Accessible: keyboard focus is always visible, form fields are labelled, Escape closes only the topmost dialog, and the chart colours were checked for colour-blind readability.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 3, React Router 6, Axios, Recharts, Lucide icons |
| Backend | Node.js, Express 4, TypeScript, Zod (validation), Pino (logging) |
| Database | PostgreSQL 16, Prisma 5 ORM (+ parameterised raw SQL for reporting) |
| Auth | JWT access token + refresh token in an httpOnly cookie, bcryptjs |
| Testing | Vitest, Supertest (unit + integration tests against a real PostgreSQL database) |
| Tooling | Docker Compose (local PostgreSQL), tsx |

---

## Architecture

```mermaid
flowchart LR
  subgraph Client["React SPA (Vite)"]
    Pages --> API["api/resources.ts"]
    API --> AX["axiosClient<br/>access token in memory<br/>silent refresh on 401"]
  end
  AX -- "REST + Bearer JWT<br/>refresh cookie on /auth" --> MW
  subgraph Server["Express API"]
    MW["helmet → cors → json → cookies → pino → rate limit"] --> R["module routers /api/v1/*"]
    R --> G["authenticate → authorize(role) → validate(Zod)"]
    G --> C[controllers] --> S["services<br/>business rules + transactions"]
    S --> P[Prisma client]
    S -. "HttpError" .-> E[central error handler]
  end
  P --> DB[(PostgreSQL)]
```

- Each request flows **route → middleware (auth, roles, validation) → controller → service → Prisma → PostgreSQL**.
- Controllers translate HTTP into function calls, and services hold the business rules and transactions.
- Every error, including Prisma's own errors, is turned into a consistent JSON response by one error handler.

---

## Roles & permissions

Permissions are enforced on the server. The UI also hides actions a role can't perform.

| Capability | Staff | Manager | Admin |
|---|:-:|:-:|:-:|
| View dashboard, products, orders, stock movements, suppliers, customers | ✅ | ✅ | ✅ |
| Record sales; create and edit customers | ✅ | ✅ | ✅ |
| Create purchase orders; change order status or cancel orders | — | ✅ | ✅ |
| Create, edit and archive products; adjust stock | — | ✅ | ✅ |
| Manage categories and suppliers; archive or delete customers | — | ✅ | ✅ |
| View the audit log | — | ✅ | ✅ |
| Manage team members and roles | — | — | ✅ |

---

## Project structure

```
stockflow-inventory/
├── docker-compose.yml              # local PostgreSQL 16
├── server/                         # Express + TypeScript API
│   ├── prisma/
│   │   ├── schema.prisma           # data model
│   │   ├── migrations/             # SQL migrations (commit these)
│   │   └── seed.ts                 # demo users, categories, supplier, products
│   └── src/
│       ├── app.ts / server.ts      # app factory + process entry
│       ├── config/                 # env (fail-fast), logger, prisma client
│       ├── middleware/             # auth, rbac, validate, rateLimit, error
│       ├── utils/                  # HttpError, asyncHandler, activity log, stock alerts
│       ├── modules/                # auth, products, orders, customers, suppliers,
│       │                           # categories, users, dashboard, stockMovements,
│       │                           # activity, notifications
│       └── tests/                  # unit (*.test.ts) + integration (*.int.test.ts)
└── client/                         # React + TypeScript + Tailwind
    └── src/
        ├── styles/tokens.css       # design tokens (colours, fonts)
        ├── api/                    # axios client + typed endpoint functions
        ├── auth/                   # AuthContext, ProtectedRoute
        ├── components/
        │   ├── ui/                 # Button, Card, DataTable, Modal, Drawer, Field, Toast…
        │   ├── domain/             # status / stock / role badges
        │   └── layout/             # app shell: sidebar, top bar, notifications
        ├── features/               # product, order and customer forms & detail panels
        ├── hooks/                  # useAsync, useDebounce, useUrlState, useReferenceData
        ├── lib/                    # formatting, errors, permissions, theme helpers
        └── pages/                  # one file per route
```

---

## Getting started

**Prerequisites:** Node.js 18+, and Docker (for local PostgreSQL) or a hosted PostgreSQL URL.

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Backend
cd server
cp .env.example .env            # then set real secrets (see below)
npm install
npm run prisma:deploy           # apply all migrations
npm run seed                    # demo users + sample data
npm run dev                     # → http://localhost:4000

# 3. Frontend (new terminal)
cd client
cp .env.example .env
npm install
npm run dev                     # → http://localhost:5173
```

**Demo accounts** (created by the seed). All use the password `Password123!`:

| Role | Email |
|---|---|
| Admin | `admin@stockflow.dev` |
| Manager | `manager@stockflow.dev` |
| Staff | `staff@stockflow.dev` |

In development builds the login page has one-click buttons for these accounts. They don't appear in production builds.

---

## Environment variables

**`server/.env`**

| Key | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets. Use two different long random values, e.g. `openssl rand -hex 32` |
| `ACCESS_TOKEN_TTL` | Access token lifetime (default `15m`) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime in days (default `7`) |
| `CLIENT_ORIGIN` | Allowed CORS origin(s), comma-separated |
| `PORT` | API port (default `4000`) |
| `NODE_ENV` | `development` / `production` |

**`client/.env`**

| Key | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the API, e.g. `http://localhost:4000/api/v1` |

The server refuses to start if `DATABASE_URL` or either JWT secret is missing. Never commit `.env` files; they're already in `.gitignore`.

---

## Database

**Tables:**
- `users`, `categories`, `suppliers`, `products`, `customers`
- `orders` and `order_items`
- `stock_movements`: an append-only stock ledger
- `notifications` and `activity_logs`

**Key design choices:**
- **Money:** stored as `DECIMAL(12,2)` / `DECIMAL(14,2)`, never as floating-point numbers.
- **Stock:** `products.quantity_in_stock` is a running total for fast reads, and every change to it also writes a `stock_movements` row in the same transaction, so stock can always be audited.
- **Stock can't go negative:** stock is only decremented when enough remains, checked in the same statement. This holds even when two sales happen at once.
- **Delete rules:** order items are deleted along with their order. Customers and products referenced by orders can't be deleted, so they're archived instead.
- **Purchase orders can't have a customer:** a database `CHECK` constraint enforces this.
- **Indexes** on product category, product stock, order status, order date, order customer and order items, plus a composite index on stock movements by product and date.

**Migrations:**
```bash
npm run prisma:migrate     # development: create + apply a migration after editing schema.prisma
npm run prisma:deploy      # any environment: apply existing migrations (never resets data)
```

The `add_customers` migration is additive and safe to run on existing data. It:
- creates `customers`;
- adds `orders.customer_id`;
- creates one customer for each distinct customer name on existing sales orders (names are trimmed and matched ignoring case);
- links those orders to their customers, including cancelled ones.

Walk-in sales and purchase orders are left without a customer. Back up before migrating a database with real data:

```bash
docker exec stockflow-db pg_dump -U stockflow -d stockflow > backup.sql
```

---

## Scripts

**server/**

| Script | Description |
|---|---|
| `npm run dev` | Start the API with hot reload |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| `npm run typecheck` | TypeScript check |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run prisma:migrate` / `prisma:deploy` | Create & apply / apply migrations |
| `npm run seed` | Load demo data |
| `npm test` | Unit and HTTP tests (no database needed) |
| `npm run test:integration` | Integration tests against a disposable database (see [Testing](#testing)) |

**client/**

| Script | Description |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | TypeScript check |

---

## API reference

- **Base URL:** `/api/v1`.
- **Auth:** protected routes need `Authorization: Bearer <accessToken>`.
- **Errors:** every error response has the shape `{ "error": "CODE", "message": "…", "details"?: … }`.

### Auth
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Register (the first user ever becomes ADMIN) |
| POST | `/auth/login` | Public | Returns an access token and sets the refresh cookie |
| POST | `/auth/refresh` | Refresh cookie | Issue a new access token |
| POST | `/auth/logout` | — | Clear the refresh cookie |
| GET | `/auth/me` | Auth | Current user |

### Products & stock
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/products?search=&categoryId=&supplierId=&stock=in\|low\|out&sort=&order=&page=&limit=` | Auth | Search, filter, sort, paginate |
| GET | `/products/low-stock` | Auth | Products at or below their reorder level |
| GET | `/products/:id` | Auth | Product details |
| GET | `/products/:id/movements` | Auth | Stock history for one product |
| POST | `/products` | Manager+ | Create a product (opening stock is recorded in the ledger) |
| PATCH | `/products/:id` | Manager+ | Update a product |
| DELETE | `/products/:id` | Manager+ | Archive a product (soft delete) |
| POST | `/products/:id/adjust` | Manager+ | Adjust stock `{ changeQty, reason, note? }`; can't go below zero |
| GET | `/stock-movements?reason=&search=&productId=` | Auth | Stock ledger (read-only) |

### Orders
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/orders` | Auth (purchases: Manager+) | Create an order; stock changes in the same transaction |
| GET | `/orders?type=&status=&search=&customerId=&page=&limit=` | Auth | List orders with filters |
| GET | `/orders/:id` | Auth | Order details, items and their stock movements |
| PATCH | `/orders/:id/status` | Manager+ | Confirm, fulfil or cancel; cancelling reverses stock |

Sales orders accept an optional `customerId`; leave it out for a walk-in sale. A sale with only a `customerName` still works, for older clients: it links to the matching customer, or creates one. Purchase orders take a `supplierId` and can't have a customer.

```http
POST /api/v1/orders
Authorization: Bearer <token>
{ "type": "SALE", "customerId": 3, "items": [{ "productId": 1, "quantity": 3 }] }

201 → { "data": { "orderNumber": "SO-000001", "status": "CONFIRMED", "totalAmount": "897", ... } }
409 → { "error": "INSUFFICIENT_STOCK", "message": "Not enough stock for \"…\"", "details": { "available": 1, "requested": 3 } }
```

### Customers
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/customers?search=&status=active\|archived\|all&sort=name\|createdAt\|orders\|totalSpent\|lastOrderAt&order=&page=&limit=` | Auth | Customers with stats, plus a walk-in sales summary |
| GET | `/customers/:id` | Auth | Customer details, stats and order history |
| POST | `/customers` | Auth | Create a customer `{ name, companyName?, email?, phone?, address?, gstin? }` |
| PUT | `/customers/:id` | Auth | Replace customer details |
| POST | `/customers/:id/archive` · `/customers/:id/restore` | Manager+ | Archive / restore |
| DELETE | `/customers/:id` | Manager+ | Delete. Only allowed when the customer has no orders; otherwise returns 409 `CUSTOMER_HAS_ORDERS` |

### Suppliers, categories, users & reporting
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET / POST | `/suppliers` | Auth / Manager+ | List / create |
| GET / PATCH | `/suppliers/:id` | Auth / Manager+ | Details (products, recent purchase orders) / update |
| GET / POST | `/categories` | Auth / Manager+ | List with product counts / create |
| PATCH | `/categories/:id` | Manager+ | Rename or change the description |
| GET / POST | `/users` | Admin | List / create team members |
| PATCH | `/users/:id` | Admin | Change role or active status |
| GET | `/dashboard/summary` | Auth | KPIs, 30-day series, category values, top products, recent orders |
| GET | `/activity?entity=&userId=&page=` | Manager+ | Audit log |
| GET | `/notifications` | Auth | Latest notifications + `unread` count |
| PATCH | `/notifications/:id/read` · `/notifications/read-all` | Auth | Mark as read |
| GET | `/health` | Public | Liveness check |

---

## Design system

The UI uses one set of design tokens, defined in `client/src/styles/tokens.css`.

- **Brand palette:**
  - Desert Sand `#ECC8AF`
  - Powder Blush `#E7AD99`
  - Dusty Rose `#CE796B`
  - Toasted Almond `#C18C5D`
  - Blue Slate `#495867`

  The tokens also include tints and shades derived from these for borders, hover states and accessible text.
- **Fonts:** DM Serif Display for headings, Manrope for everything else (Google Fonts).
- **Tailwind is restricted to the tokens.** `tailwind.config.js` replaces Tailwind's default palette instead of extending it, so classes like `blue-500` don't compile. Use these names instead:

  | Class prefix | Meaning |
  |---|---|
  | `ink` | neutrals |
  | `brand` | Dusty Rose |
  | `sand`, `blush`, `almond` | accent colours |
  | `success`, `warning`, `danger`, `info` | status colours |
  | `surface`, `canvas`, `sidebar`, `primary` | semantic aliases |

- **Charts** read their colours from the tokens through `src/lib/theme.ts`. The sales/purchases pair was checked for colour-blind readability.

---

## Security
- **Passwords:** hashed with bcrypt (cost 12). Never stored or logged in plain text.
- **Tokens:**
  - A short-lived access token (15 minutes) kept in memory, never in `localStorage`.
  - A refresh token in an **httpOnly, SameSite cookie**, scoped to `/api/v1/auth`.
  - A failed silent refresh signs the user out.
- **Authorisation:** server-side role checks on every route.
- **Input validation:** Zod schemas on every request body and query. IDs are validated, so malformed input returns 400, not 500.
- **SQL injection:** prevented by Prisma's parameterised queries. Raw SQL uses tagged templates, and sort columns are whitelisted.
- **Headers and access:** Helmet security headers, a CORS allow-list, and rate limiting (general, plus a stricter limit on login and registration).
- **Logs:** `Authorization` headers and cookies are redacted.
- **Secrets:** only via environment variables; the config fails fast if one is missing.
- **Login errors:** generic ("Invalid email or password"), so they don't reveal which emails exist.

---

## Testing

```bash
cd server
npm test                      # unit + HTTP tests, no database needed
```

**Integration tests** (`src/tests/*.int.test.ts`) run real workflows against a **disposable** PostgreSQL database. They empty every table, so the setup refuses any database whose name doesn't contain `test`:

```bash
docker exec stockflow-db createdb -U stockflow stockflow_test
DATABASE_URL=postgresql://stockflow:stockflow@localhost:5432/stockflow_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://stockflow:stockflow@localhost:5432/stockflow_test npm run test:integration
```

**Coverage:** 6 unit tests and 39 integration tests.

**Orders & stock:**
- Concurrent sales never oversell.
- Order totals are exact to the paisa.
- The same product can't appear twice in one order.
- Cancelling reverses stock, and a purchase can't be cancelled once its stock is sold.
- Every change writes ledger and audit entries.
- Low-stock alerts fire once.
- Dashboard figures match the underlying orders.

**Customers:**
- Create, read, update, archive and delete, with validation and duplicate checks.
- Statistics exclude cancelled orders.
- Renaming a customer doesn't rewrite past orders.
- Walk-in sales and purchase orders behave correctly, including the database rule on purchases.

**Roles:** permission checks for Staff, Manager and Admin.

---

## Deployment

A free-tier setup that works well:
- **Database:** [Neon](https://neon.tech) or [Supabase](https://supabase.com). Put the connection string in `DATABASE_URL`.
- **Backend:** [Render](https://render.com) web service.
  - Build command: `npm install && npm run build && npm run prisma:deploy`
  - Start command: `npm start`
  - Set all the `server/.env` variables in the dashboard.
- **Frontend:** [Vercel](https://vercel.com). Set `VITE_API_URL` to the deployed API URL; build with `npm run build`, output folder `dist/`.
- **CORS:** set the backend's `CLIENT_ORIGIN` to the frontend's URL.
- **Gotchas:**
  - Cross-site cookies need `SameSite=None; Secure`, which the server sets automatically when `NODE_ENV=production`.
  - Render's free services sleep when idle, so the first request after a pause is slow.

---

## Known limitations
- **Refresh tokens can't be revoked.** Nothing is stored on the server, so logging out only clears the cookie, and a role change takes effect at the user's next token refresh (within 15 minutes).
- **The order form lists 100 records at most:** the first 100 products and the first 100 active customers. It needs a searchable picker for larger catalogues.
- **Rate limits are kept in memory per server process.** Running several instances would need a shared store such as Redis.

## Roadmap
- Searchable product and customer pickers.
- CSV import, product images, barcode scanning.
- Multi-warehouse stock.
- Top customers on the dashboard.
- Real-time notifications (WebSockets).
- A CI pipeline (GitHub Actions) running the integration suite against a temporary PostgreSQL database.

---

*Built by Vishali A — Full Stack Developer (React · Node · TypeScript · PostgreSQL).*
