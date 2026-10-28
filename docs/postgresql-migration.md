# TunTun Bakers: PostgreSQL migration foundation

## Status

This is a **schema foundation, not a completed backend conversion**. Existing controllers use Mongoose methods such as `findById`, `populate`, `save`, and MongoDB aggregation pipelines. They will continue to require MongoDB until each controller is rewritten and tested against PostgreSQL.

## Safe migration sequence

1. Create a new PostgreSQL database compatible with your deployment.
2. Back up MongoDB and keep the current production database unchanged.
3. Apply `database/schema.sql` to the new, empty PostgreSQL database.
4. Add the PostgreSQL driver (`pg`) and a connection pool using `DATABASE_URL`; enable TLS as required by the database provider. Do not commit credentials.
5. Build and test a data-export/import utility that preserves existing MongoDB ObjectId values as text IDs and maps embedded arrays (`addresses`, `items`, `timeline`) to the relational tables/JSONB columns defined here.
6. Rewrite repositories/controllers and admin analytics for SQL, preserving the API response contract used by the current frontend.
7. Test Clerk user upsert, product listing/search, cart/favorites, order creation/cancellation and stock updates, Razorpay verification/refunds, admin access control, and analytics.
8. Validate imported row counts and totals, then deploy to staging. Switch production only after acceptance tests and a rollback plan are ready.

## Important mapping decisions

- IDs are `TEXT` to allow existing 24-character MongoDB ObjectId strings to survive migration without changing frontend identifiers.
- Address records and saved payment methods are normalized into separate tables.
- Cart and favorites are normalized into parent/child tables.
- Order item name and price are snapshots, so historical receipts do not change if a product is renamed or repriced.
- Delivery address and order timeline use `JSONB` to preserve their existing flexible response structures.
- Monetary fields use `NUMERIC(12,2)`, not floating-point columns.

## Security and repository hygiene

- Rotate any secrets that have ever been committed (MongoDB URI, Clerk secret, Razorpay secret, Cloudinary secret, JWT secret, and webhook secrets).
- Remove `.env` from Git tracking and add it to `.gitignore`; use deployment environment variables instead.
- Add `node_modules/`, logs, and local environment files to `.gitignore`.
- Never put Razorpay secret keys in frontend code or expose them in API responses.

## Not yet implemented

- PostgreSQL connection module and startup health checks.
- SQL repository layer and converted controllers.
- MongoDB-to-PostgreSQL data migration script.
- Integration tests and production cutover.

Do not remove Mongoose or the MongoDB environment variable until those steps are complete.
