const { Pool } = require('pg');

const rawConnectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!rawConnectionString) {
  throw new Error('Missing DATABASE_URL (or POSTGRES_URL) environment variable');
}

function normalizeConnectionString(value) {
  // Neon connection strings commonly use sslmode=require. Explicit verify-full
  // avoids pg-connection-string's forward-compatibility warning and verifies
  // both the certificate chain and hostname. Never log this URL: it contains secrets.
  const url = new URL(value);
  if (/\.neon\.tech$/i.test(url.hostname)) {
    const mode = url.searchParams.get('sslmode');
    if (!mode || ['prefer', 'require', 'verify-ca'].includes(mode.toLowerCase())) {
      url.searchParams.set('sslmode', 'verify-full');
    }
  }
  return url.toString();
}

const pool = new Pool({
  connectionString: normalizeConnectionString(rawConnectionString),
  max: Number.parseInt(process.env.PG_POOL_MAX || '5', 10),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (error) => {
  // Never log connection strings or credentials.
  console.error('Unexpected idle PostgreSQL client error:', error.message);
});

module.exports = pool;
