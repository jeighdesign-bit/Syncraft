# Syncraft

Syncraft is a Next.js app for design tools, customer workspaces, the store, and related admin and payment flows.

## Run locally

1. Install dependencies with `npm ci`.
2. Configure the required values in `.env.local` for the features you need to run. Keep this file local.
3. Start the app with `npm run dev`.

Use `npm test` for the Node test suite and `npm run build` to check a production build.

## Project map

| Path | Purpose |
| --- | --- |
| `src/app/` | Pages, API routes, and page-specific components and styles |
| `src/components/` | Components shared across pages |
| `src/lib/` | Server and domain logic, integrations, and reusable helpers |
| `src/services/` | Service modules |
| `src/utils/` | General and Supabase utilities |
| `database/` | SQL setup and schema changes |
| `docs/` | Reference notes and external documentation links |
| `tests/` | Automated tests |
| `scripts/` | Maintenance and development scripts; `maintenance/wipe-projects.js` deletes database projects and must only be run intentionally |
| `public/` | Assets served by the app |
| `assets/source-images/`, `assets/demo-videos/` | Source artwork and demo media kept outside the served assets |
| `.agents/` | Project-local agent skills and resources |

## Local work and generated files

`.codex-work/` holds local task work, dependencies, previews, and exports. `outputs/` holds generated artifacts. Both are kept outside Git and excluded from Vercel deployments. Do not put app source or durable documentation in these folders.

Keep credentials in local environment files, never in source control. The owner finance tracker and its supporting routes are local-only; see the related rules in `.gitignore` and `.vercelignore`.

Before moving an asset from `public/`, check its URL references in the app. Files there are addressed by their path, so a move can break images or downloads.
