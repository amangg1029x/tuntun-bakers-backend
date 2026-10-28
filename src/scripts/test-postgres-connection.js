require('dotenv').config();

async function main() {
  let pool;
  try {
    pool = require('../config/postgres');
    const result = await pool.query('SELECT current_database() AS database_name, current_schema() AS schema_name, NOW() AS server_time');
    const row = result.rows[0];
    console.log('PostgreSQL connection successful.');
    console.log('Database:', row.database_name);
    console.log('Schema:', row.schema_name);
    console.log('Server time:', new Date(row.server_time).toISOString());
  } catch (error) {
    console.error('PostgreSQL connection test failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}

main();
