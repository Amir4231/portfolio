# Achievement Image Carousel — Design

Date: 2026-08-22

## Goal

When adding an achievement via the admin, the author can attach multiple images
(uploaded files or external URLs) to showcase it. On the public site, each
achievement gains a detail page at `/achievements/[id]/` with an autoplaying
image carousel. The milestone card links to that page. This complements (does
not replace) the existing credential URL / "Verify" link.

## Context

- Achievements are DB-backed (SQLite via libsql), edited through
  `src/pages/admin/achievements/[id].astro` which POSTs to
  `src/pages/api/achievements.ts`, stored via `src/lib/db.ts`, and rendered on
  the homepage by `src/components/AchievementCard.astro`.
- Existing image precedents:
  - Avatar upload: multipart form + sharp resize → base64 data URI stored in DB
    (`src/pages/api/settings.ts`).
  - Project hero images: single URL or local filename (`heroImage`).
  - Projects store tag lists as JSON in a TEXT column.
- Achievements have a `body` "Notes (optional Markdown)" admin field that is
  currently never rendered publicly.
- Project detail pages (`src/pages/projects/[slug].astro`) set the pattern for
  a public detail page: `BaseLayout` with SEO meta, back link, header, prose
  body.

## 1. Data model & storage

- New type in `src/lib/types.ts`:
  - `interface AchievementImage { src: string; alt: string }`
  - `Achievement` gains `images: AchievementImage[]`.
- New `achievements.images` column: `TEXT NOT NULL DEFAULT '[]'`, storing a JSON
  array of `{ src, alt }`.
  - Uploaded files stored as `data:image/jpeg;base64,...` data URIs.
  - External URLs stored as-is (http/https only).
- Idempotent migration in `src/lib/db.ts` `initSchema()`: after the
  `CREATE TABLE IF NOT EXISTS` statements, check
  `PRAGMA table_info(achievements)`; if an `images` column is absent, run
  `ALTER TABLE achievements ADD COLUMN images TEXT NOT NULL DEFAULT '[]'`.
- `rowToAchievement` parses the JSON; `createAchievement`/`updateAchievement`
  serialize it with `JSON.stringify`.

## 2. Admin form & API

- `src/pages/admin/achievements/[id].astro`:
  - Form gains `enctype="multipart/form-data"`.
  - Multi-file upload: `<input type="file" name="images" accept="image/png,image/jpeg,image/webp" multiple>`.
  - Textarea `imageUrls`: one URL per line.
  - Existing images render as a list with a per-image "Remove" checkbox named
    `removeImage_<index>`, so saved images can be deleted without re-uploading.
  - Error banners mirror the settings avatar errors:
    `?error=image-size` ("under 5MB") and `?error=image-invalid`
    ("try a JPG/PNG/WebP").
- `src/pages/api/achievements.ts`:
  - Read `imageUrls` (split lines, trim, keep only `http(s)://`).
  - Read uploaded files; each must be a supported image type and ≤5MB; resize
    via sharp to width 1600 (fit inside), jpeg q82, store as base64 data URI.
  - Merge order: kept existing images (not checked for removal) first, then
    new uploads, then URL images. Drop the removed/absent entries.
  - `alt` for uploads derives from the achievement title; URL entries use an
    empty alt.
  - On validation failure redirect to `?error=...` instead of saving.

## 3. Public detail page `/achievements/[id]/`

- New `src/pages/achievements/[id].astro`, modeled on
  `src/pages/projects/[slug].astro`:
  - `getAchievement(id)`; if missing, `return Astro.redirect("/")`.
  - `BaseLayout` with `title`, `description`, `image` (first carousel image
    when available), `type="article"`.
  - Back link to the homepage achievements section.
  - Header: category, date, issuer, title, description, highlight metric, and
    the existing "Verify" credential link.
  - `AchievementCarousel` (see below) rendered when `images.length > 0`.
  - The existing `body` Notes field renders as markdown (`renderMarkdown`) in a
    prose block below, reusing the project page's prose styling.

## 4. Carousel component

- New `src/components/AchievementCarousel.astro`, a client island
  (`client:load`). Props: `images: AchievementImage[]`, `title: string`.
- Behavior:
  - Autoplay every ~4s; pauses on hover and on focus (prevents fighting the
    user).
  - Prev/next arrow buttons and dot indicators.
  - Keyboard: Left/Right arrows navigate; region has `role="region"`,
    `aria-roledescription="carousel"`, `aria-label` from title, live
    `aria-live="polite"` for the current slide label.
- Active slide styling: gold hairline border frame with four corner sparkles
  (CSS-only, subtle twinkle animation, gold gradient, theme-aware via existing
  CSS variables / dark-mode tokens).
- Layout: `aspect-[16/9]` container, `object-cover`. Base64 data URIs render as
  plain `<img>` (no `astro:assets` optimization); external URLs also plain
  `<img>` with `loading="lazy"`.

## 5. Card changes

- `src/components/AchievementCard.astro`: title becomes a link to
  `/achievements/[id]/` with an `ArrowUpRight` affordance, mirroring the
  project cards. Verify link, highlight metric, and description stay. If
  `images.length > 0`, optionally show a small thumbnail hint
  (e.g. "N images").

## 6. Verification

- `npm run build` (typecheck + production build) passes.
- Browser check via dev server: create an achievement with uploads + URLs,
  confirm the carousel renders on the detail page, autoplays, navigates with
  arrows/dots/keyboard, pauses on hover, shows the gold frame on the active
  slide, and the card links through correctly.