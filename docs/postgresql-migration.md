# TunTun Bakers: PostgreSQL migration foundation

## Status

This is a **migration in progress, not a completed backend conversion**. Existing controllers still use Mongoose. The production API should continue using MongoDB until SQL repositories/controllers have been implemented and tested.

## Current migration tools

1. Back up MongoDB before starting.
2. Export a local snapshot: `CONFIRM_DATA_EXPORT=YES node src/scripts/export-mongo-data.js`
3. Validate the snapshot: `node src/scripts/validate-migration-export.js ./tuntun-migration-export-....migration-export.json`
4. Keep the export private. It contains customer/user data and may contain password hashes and payment metadata. It is ignored by Git; do not upload it or commit it. Delete it securely when no longer needed.
5. Apply `database/schema.sql` to a **new, empty** PostgreSQL database only after reviewing the schema.
6. Implement and test the SQL import process. Preserve MongoDB ObjectId values as text IDs and map embedded arrays (`addresses`, `items`, `timeline`) to the relational tables/JSONB columns.
7. Rewrite repositories/controllers and admin analytics for SQL, preserving the API response contract used by the current frontend.
8. Test Clerk user upsert, product listing/search, cart/favorites, order creation/cancellation and stock updates, Razorpay verification/refunds, admin access control, and analytics.
9. Compare row counts and monetary totals, test on staging, and prepare a rollback plan before any production switch.

The export and validator are read-only with respect to the source database. The export script requires the explicit `CONFIRM_DATA_EXPORT=YES` flag.

## Important mapping decisions

- IDs are `TEXT` so existing MongoDB ObjectId strings can survive migration without changing frontend identifiers.
- Addresses and saved payment methods are normalized into separate tables.
- Cart and favorites are normalized into parent/child tables.
- Order item name and price are snapshots, so historical receipts do not change if a product is renamed or repriced.
- Delivery address and order timeline use `JSONB` to preserve flexible structures.
- Monetary fields use `NUMERIC(12,2)`, not floating-point columns.

## Security and repository hygiene

- Rotate any secrets that have ever been committed (MongoDB URI, Clerk secret, Razorpay secret, Cloudinary secret, JWT secret, and webhook secrets).
- `.env` was removed from this migration branch and is ignored going forward. It remains in the history and may remain in `main`; rotate exposed secrets and remove it from all branches as a separate security cleanup.
- `node_modules/`, logs, local environment files, and migration exports are ignored.
- Never put Razorpay secret keys in frontend code or expose them in API responses.

## Not yet implemented

- PostgreSQL driver dependency and connection pool.
- SQL repository layer and converted controllers.
- PostgreSQL import script.
- Integration tests and production cutover.

Do not remove Mongoose or the MongoDB environment variable until those steps are complete.
