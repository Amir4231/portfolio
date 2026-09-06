# Portfolio

Personal portfolio built with Astro + Tailwind CSS, deployed on Vercel. Content (projects, achievements, stack, site settings) is editable from `/admin` and stored in libSQL/Turso with `file:./local.db` fallback for local dev.

## Stack

- Astro 7 (SSR, `output: server`), Vercel adapter
- Tailwind CSS 4, GSAP + Lenis
- Spline 3D (`@splinetool/runtime`) via `Desk3D`
- libSQL (`@libsql/client`), Sharp, Shiki, MDX

## Quickstart

```bash
npm install
cp .env.example .env
npm run db:seed
npm run dev
```

Open `http://localhost:4321`. Admin at `/admin` (default password `admin` from `ADMIN_PASSWORD` — change it).

## Env

```
TURSO_DATABASE_URL=file:./local.db
# TURSO_DATABASE_URL=libsql://<db>-<org>.turso.io
# TURSO_AUTH_TOKEN=...
ADMIN_PASSWORD=change-me
# SESSION_SECRET=...
```

## Admin

- `/admin` — projects + achievements list, links to settings/stack
- `/admin/settings` — name, role, links, tagline, avatar
- `/admin/stack` — tech stack categories/items (stored as `settings.skills` JSON)
- `/admin/projects/new`, `/admin/achievements/new` — create entries

Homepage sections (`src/pages/index.astro`): Hero → 3D desk → Selected work → Milestones → Stack → Contact.

## 3D desk

Homepage embeds a lazy-loaded Spline scene (`src/components/Desk3D.astro`):
init on viewport entry via IntersectionObserver, GSAP skeleton loader,
WebGL cleanup on unmount, render-resolution cap (`renderScale`, auto ≈ 1
backing px per CSS px on HiDPI), and render pause (`stop()`/`play()`)
when scrolled out of view.

- Scene URL lives on the `sceneUrl` prop in `src/pages/index.astro`. To
  replace it: Spline editor → Export → Code → Vanilla JS → copy the fresh
  `.../scene.splinecode` URL. Only `.splinecode` loads in the runtime —
  `.spline` project files are editor-only (don't commit them).
- Self-hosting also works: drop an exported `.splinecode` into `public/`
  and use `sceneUrl="/<name>.splinecode"`.

## Scripts

```bash
npm run dev       # local dev
npm run build     # production build
npm run preview   # preview build
npm run check     # astro check
npm run db:seed   # seed local.db from src/content + defaults
```

## Structure

```
src/components/  TechStack, Hero, Desk3D (Spline), ProjectCard, AchievementCard, Contact
src/data/        skills.ts (stack fallback), site.ts
src/lib/         db.ts (getSkills, projects, achievements, settings), auth.ts
src/pages/       index, projects, achievements, admin/*, api/*
scripts/seed.mjs seed projects/achievements/settings/skills
docs/superpowers/specs|plans  design docs
```

## Troubleshooting

- `504 (Outdated Optimize Dep)` in dev (usually right after adding a
  dependency): `npx astro dev stop`, delete `node_modules/.vite`, restart dev.
