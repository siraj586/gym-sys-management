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
```

## Daily commands

| Command             | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | API on http://localhost:4000, app on http://localhost:5173 |
| `npm test`          | Server tests (needs the database running)                  |
| `npm run lint`      | ESLint                                                     |
| `npm run typecheck` | TypeScript checks for every package                        |
| `npm run build`     | Production build of all three packages                     |
| `npm run format`    | Prettier                                                   |

The app calls the API through the Vite dev proxy (`/api`), so the browser sees one origin.
