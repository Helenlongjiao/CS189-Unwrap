import pg from 'pg';

export const DEFAULT_DATABASE_URL = 'postgres://localhost:5432/pulse_dev';

export function createPool(connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL) {
  return new pg.Pool({ connectionString, max: 10 });
}
