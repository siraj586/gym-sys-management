// Runs before each test file is imported: point the app at the test database.
import 'dotenv/config';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
