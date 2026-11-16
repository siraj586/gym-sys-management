import 'dotenv/config';
import { execSync } from 'node:child_process';

/** Runs once before all tests: brings the test database up to the latest migration. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set. Copy it from server/.env.example.');
  }
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
