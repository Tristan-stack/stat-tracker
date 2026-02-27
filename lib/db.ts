import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // In dev we prefer a clear error when DB URL is missing.
  console.warn('DATABASE_URL is not set. Rugger features will be disabled.');
}

export const db = connectionString ? neon(connectionString) : null;

export async function query<T>(
  sql: string,
  params: (string | number | boolean | null)[]
): Promise<T[]> {
  if (!db) {
    throw new Error('DATABASE_URL is not configured');
  }
  const result = (await db.query(sql, params)) as T[];
  return result;
}

