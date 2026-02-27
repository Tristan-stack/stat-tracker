import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { Pool } from 'pg';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

const ONE_HOUR = 60 * 60;

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export const auth = betterAuth({
  baseURL,
  trustedOrigins: [
    baseURL,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ],
  database: connectionString
    ? new Pool({ connectionString })
    : undefined,
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: ONE_HOUR,
    updateAge: ONE_HOUR,
  },
  plugins: [nextCookies()],
});
