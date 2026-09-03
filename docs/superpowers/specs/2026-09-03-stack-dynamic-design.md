# Dynamic Stack Design — 2026-09-03

## Context
Portfolio homepage `#skills` section renders static `src/data/skills.ts` (`Record<string,string[]>` with Frontend, Backend, DevOps, Tools) via `src/components/TechStack.astro`. User wants full-control editing from `/admin` without code changes.

Existing patterns: `src/lib/db.ts` (libsql/Turso + `file:./local.db` fallback, `settings` key/value table, `getSettings`/`saveSettings`), `src/pages/admin/*` + `src/pages/api/*` with `isAuthorized` cookie check + middleware rate-limit, `scripts/seed.mjs` seeding.

## Goal
Make Stack dynamic with full control: rename/add/remove/reorder categories, edit/add/remove items, changes go live immediately.

## Decision
Settings-JSON approach (chosen over dedicated `skills` table). Rationale: simplest, no migration, matches existing settings flow, works Turso+local, sufficient for 4-10 categories. Dedicated table rejected as overkill.

## Architecture & Data
- Store JSON string in `settings` key `skills`: `Record<string,string[]>` e.g. `{"Frontend":["TypeScript",...]}`.
- New `getSkills(): Promise<Record<string,string[]>>` in `src/lib/db.ts`: reads `getSettings()`, `JSON.parse(settings.skills)`, validates shape (object, string keys, string[] values, trim, drop empties), falls back to `src/data/skills.ts` defaults on missing/corrupt.
- `scripts/seed.mjs`: `INSERT OR IGNORE` default skills JSON derived from current static file.
- No schema migration. `src/data/skills.ts` retained as fallback/defaults.

## Components
- `src/components/TechStack.astro`: add optional `skills` prop `Record<string,string[]>`, fallback to static import if absent. No visual change.
- `src/pages/index.astro`: `const skills = await getSkills()` and `<TechStack skills={skills} />`.
- New `src/pages/admin/stack.astro` (AdminLayout): vanilla JS editor matching admin styling. Features: edit category names, add category (max 10), remove category, move up/down, edit items, add/remove item (max 30/cat, max length 60/30 chars). Serializes to hidden `skills` JSON field on submit.
- `src/pages/admin/index.astro`: add link `Edit stack →` to `/admin/stack`.

## Flow & Errors
- New `src/pages/api/skills.ts` POST: `isAuthorized` check → 401 if unauthed. Parse `form.get('skills')` JSON. Validate: object, ≤10 keys, key 1-30 chars, values arrays ≤30 items, item 1-60 chars, trim, strip empties, drop empty categories, reject empty result with 303 `?error=invalid`. `saveSettings({skills: JSON.stringify(cleaned)})` → 303 `/admin/stack?saved=1`.
- Corrupt DB JSON read path → fallback defaults, admin shows warning banner.
- Existing middleware rate-limit (`api:ip`) covers new endpoint. No new auth logic.

## Testing & Scope
- Verify: `pnpm build` / `astro check`, homepage renders DB skills, admin edit→save→homepage reflects, delete key → fallback renders, unauthed POST 401/redirect, validation rejects bad JSON.
- Out of scope: per-skill icons/colors, drag-drop (buttons only), search/filter, public read API, i18n.

## Risks
- JSON in settings is opaque to SQL — acceptable for small dataset.
- Concurrent edits last-write-wins — same as existing settings, acceptable.
