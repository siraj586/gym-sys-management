# Calisthenics Coach

Management system for a monthly-membership calisthenics gym: members, subscriptions,
payments, attendance, training programs and progress. Public website, coach dashboard
and client portal in one app, in English and Arabic.

## Structure

| Folder   | What it is                                                   |
| -------- | ------------------------------------------------------------ |
| `shared` | Types and Zod schemas used by both the server and the client |
| `server` | Express REST API, Prisma schema and migrations (PostgreSQL)  |
| `client` | React app (Vite, Tailwind CSS, React Router, i18next)        |

## First-time setup

Requires Node.js 22+ and Docker.

```bash
npm install
cp server/.env.example server/.env
npm run db:up        # PostgreSQL in Docker
npm run db:migrate   # create the tables
npm run db:seed      # create the owner account from OWNER_EMAIL / OWNER_PASSWORD
```

Before seeding, open `server/.env` and set `JWT_ACCESS_SECRET` (`openssl rand -base64 48`),
`OWNER_EMAIL` and `OWNER_PASSWORD`.

## Daily commands

| Command             | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | API on http://localhost:4000, app on http://localhost:5173 |
| `npm test`          | Server tests, on their own `calisthenics_test` database    |
| `npm run lint`      | ESLint                                                     |
| `npm run typecheck` | TypeScript checks for every package                        |
| `npm run build`     | Production build of all three packages                     |
| `npm run format`    | Prettier                                                   |

To try every screen with realistic data, fill an **empty** database with demo members,
payments, check-ins, programs and progress (it refuses a database that has members):

```bash
DEMO_PASSWORD=choose-a-long-password npm run db:demo -w @calisthenics/server
```

Then sign in as `demo-coach@example.test` (coach) or `demo-client@example.test` (client)
with that password.

The app calls the API through the Vite dev proxy (`/api`), so the browser sees one origin.

## Accounts and roles

- `OWNER` (the coach) is created by `npm run db:seed` and opens `/admin`.
- `CLIENT` accounts register themselves on `/login` and open `/portal`.
- The API checks the role on every request; the route guards in the app are only for navigation.
