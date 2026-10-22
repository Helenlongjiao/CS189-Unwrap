import '../src/env.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const pool = createPool();
try {
  await migrate(pool);
  console.log('database is up to date');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
