const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error('Missing DATABASE_URL (or POSTGRES_URL) environment variable');
}

const pool = new Pool({
  connectionString,
  // Neon requires TLS. This does not disable certificate verification.
  ssl: /neon\.tech/i.test(connectionString) ? { rejectUnauthorized: true } : undefined,
  max: Number.parseInt(process.env.PG_POOL_MAX || '5', 10),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (error) => {
  // Never log connection strings or credentials.
  console.error('Unexpected idle PostgreSQL client error:', error.message);
});

module.exports = pool;
