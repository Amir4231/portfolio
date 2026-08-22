# Achievement Image Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow achievements to carry multiple images (uploaded files or external URLs, edited from the admin) and display them in an autoplaying, gold-framed carousel on a new public detail page at `/achievements/[id]/`.

**Architecture:** Add an `images` JSON column (array of `{ src, alt }`) to the existing SQLite `achievements` table. The admin form gains a multi-file upload + one-URL-per-line textarea and per-image remove checkboxes; the API validates/resizes uploads with sharp and stores base64 data URIs or external URLs. A new `AchievementCarousel` client-island component renders the images; a new `src/pages/achievements/[id].astro` detail page hosts it and also renders the currently-unused `body` Notes field. Milestone cards link to the detail page.

**Tech Stack:** Astro 7 (server islands), TypeScript, SQLite via `@libsql/client`, `sharp` (image resize), Tailwind CSS v4 + custom CSS, `marked` (markdown), `@lucide/astro` icons.

## Global Constraints

- **No unit test framework exists.** Verification is `npm run check` (Astro/TS typecheck) followed by `npm run build`, plus manual browser checks against `npm run dev`.
- Follow existing patterns: DB-backed data flows through `src/lib/db.ts`; public pages use `BaseLayout` and `data-reveal`; admin pages use `AdminLayout` and the existing `rounded-sm border border-line bg-raised px-3 py-2.5 text-ink focus:border-accent focus:outline-none` input classes.
- Uploaded images become `data:image/jpeg;base64,...` data URIs (sharp-resized, like the avatar in `src/pages/api/settings.ts`); external URLs are stored as-is (http/https only).
- Image validation: each upload must be JPG/PNG/WebP and ≤ 5MB; errors redirect to `?error=image-size` / `?error=image-invalid`.
- Gold accent uses a new `--color-gold` CSS token: `#c9a227` (light) / `#e2c25d` (dark).
- Do not modify `src/pages/sitemap.xml.ts`; achievement detail pages are out of scope for the sitemap.

---

### Task 1: Data model & DB migration

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/pages/api/achievements.ts` (add `images: []` placeholder so the build stays green)
- Modify: `scripts/seed.mjs` (schema only)

**Interfaces:**
- Produces: `interface AchievementImage { src: string; alt: string }` in `src/lib/types.ts`; `Achievement.images: AchievementImage[]`; `createAchievement(data: Omit<Achievement, "id">)` and `updateAchievement(id, data)` now read/write `data.images`; `rowToAchievement` returns `images`.

- [ ] **Step 1: Add the type**

In `src/lib/types.ts`, add before `Achievement`:

```ts
export interface AchievementImage {
  src: string;
  alt: string;
}
```

and add `images: AchievementImage[];` to the `Achievement` interface (after `highlightMetric`, before `body`).

- [ ] **Step 2: Update the DB schema, migration, and row mapping**

In `src/lib/db.ts`:

1. Update the import to `import type { Achievement, AchievementImage, Project } from "./types";`
2. In the `SCHEMA` string's `achievements` table, add `images TEXT NOT NULL DEFAULT '[]',` right after the `highlight_metric TEXT NOT NULL DEFAULT '',` line.
3. In `initSchema()`, after `await db.executeMultiple(SCHEMA);`, add a migration call:

```ts
async function ensureAchievementImagesColumn(): Promise<void> {
  const info = await db.execute("PRAGMA table_info(achievements)");
  const hasImages = (info.rows as Record<string, unknown>[]).some(
    (row) => String(row.name) === "images",
  );
  if (!hasImages) {
    await db.execute(
      "ALTER TABLE achievements ADD COLUMN images TEXT NOT NULL DEFAULT '[]'",
    );
  }
}

export async function initSchema(): Promise<void> {
  await db.executeMultiple(SCHEMA);
  await ensureAchievementImagesColumn();
}
```

4. Add a parser helper near `rowToAchievement`:

```ts
function parseImages(raw: string): AchievementImage[] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is { src: string; alt?: string } =>
          !!item && typeof (item as { src?: unknown }).src === "string",
      )
      .map((item) => ({ src: String(item.src), alt: String(item.alt ?? "") }));
  } catch {
    return [];
  }
}
```

5. In `rowToAchievement`, add `images: parseImages(String(row.images ?? "[]")),` after the `highlightMetric` line.

- [ ] **Step 3: Update create/update to persist images**

In `src/lib/db.ts`, change `createAchievement`:

```ts
  await db.execute({
    sql: `INSERT INTO achievements (id, title, category, date, issuer, description, credential_url, highlight_metric, images, body)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.title,
      data.category,
      data.date,
      data.issuer,
      data.description,
      data.credentialUrl,
      data.highlightMetric,
      JSON.stringify(data.images),
      data.body,
    ],
  });
```

and `updateAchievement`:

```ts
  await db.execute({
    sql: `UPDATE achievements SET title = ?, category = ?, date = ?, issuer = ?,
          description = ?, credential_url = ?, highlight_metric = ?, images = ?, body = ?
          WHERE id = ?`,
    args: [
      data.title,
      data.category,
      data.date,
      data.issuer,
      data.description,
      data.credentialUrl,
      data.highlightMetric,
      JSON.stringify(data.images),
      data.body,
      id,
    ],
  });
```

- [ ] **Step 4: Keep the API compiling**

In `src/pages/api/achievements.ts`, the `data` object currently has no `images` key. Add `images: [],` after the `highlightMetric` line (Task 2 replaces this placeholder with real logic).

- [ ] **Step 5: Sync the seed schema**

In `scripts/seed.mjs`, add `images TEXT NOT NULL DEFAULT '[]',` to the `achievements` table in its `SCHEMA` string (after `highlight_metric TEXT NOT NULL DEFAULT '',`). Do not change its INSERT statement.

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: no type errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/db.ts src/pages/api/achievements.ts scripts/seed.mjs
git commit -m "feat: achievement images data model + DB migration"
```

---

### Task 2: Admin form & API image handling

**Files:**
- Modify: `src/pages/admin/achievements/[id].astro`
- Modify: `src/pages/api/achievements.ts`

**Interfaces:**
- Consumes: `AchievementImage`, `Achievement.images` from Task 1; `getAchievement(id)` from `src/lib/db.ts` (already exported).
- Produces: admin form that uploads `images` (multi-file), `imageUrls` (textarea), and `removeImage_<index>` checkboxes; API `POST /api/achievements` that stores the merged image array.

- [ ] **Step 1: Read error param and show banners**

In `src/pages/admin/achievements/[id].astro` frontmatter, after the `CATEGORIES` const, add:

```ts
const error = Astro.url.searchParams.get("error");
```

In the template, after the "Achievement not found" block, add:

```astro
  {error === "image-size" && (
    <p class="mt-4 rounded-sm border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent">
      One of the images is too large. Keep each under 5MB.
    </p>
  )}
  {error === "image-invalid" && (
    <p class="mt-4 rounded-sm border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent">
      Couldn't process one of the images. Try a JPG, PNG, or WebP.
    </p>
  )}
```

- [ ] **Step 2: Switch the form to multipart and add image fields**

In `src/pages/admin/achievements/[id].astro`, change the form tag to:

```astro
  <form method="post" action="/api/achievements" enctype="multipart/form-data" class="mt-6 space-y-5">
```

After the "Credential URL" field's closing `</label>` (i.e. after the closing of the `grid` div that wraps highlightMetric + credentialUrl), insert the current-images list, the upload field, and the URL textarea:

```astro
    {achievement && achievement.images.length > 0 && (
      <div>
        <span class="text-sm font-medium text-muted">Current images</span>
        <ul class="mt-2 space-y-2">
          {achievement.images.map((img, i) => (
            <li class="flex items-center gap-3 rounded-sm border border-line bg-raised px-3 py-2">
              <img
                src={img.src}
                alt={img.alt || achievement.title}
                class="size-14 shrink-0 rounded-sm border border-line object-cover"
              />
              <span class="min-w-0 flex-1 truncate text-xs text-faint">
                {img.src.length > 60 ? `${img.src.slice(0, 57)}…` : img.src}
              </span>
              <label class="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  name={`removeImage_${i}`}
                  value="1"
                  class="size-3.5 accent-[var(--color-accent)]"
                />
                Remove
              </label>
            </li>
          ))}
        </ul>
      </div>
    )}

    <label class="block">
      <span class="text-sm font-medium text-muted">
        Upload images (JPG/PNG/WebP, under 5MB each)
      </span>
      <input
        type="file"
        name="images"
        accept="image/png,image/jpeg,image/webp"
        multiple
        class="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-semibold file:text-surface hover:file:opacity-90"
      />
    </label>

    <label class="block">
      <span class="text-sm font-medium text-muted">Image URLs (one per line)</span>
      <textarea
        name="imageUrls"
        rows="3"
        placeholder="https://…"
        class="mt-1 w-full rounded-sm border border-line bg-raised px-3 py-2.5 font-mono text-xs leading-relaxed text-ink focus:border-accent focus:outline-none"
      ></textarea>
    </label>
```

- [ ] **Step 3: Process images in the API**

In `src/pages/api/achievements.ts`, update the import to `import { createAchievement, deleteAchievement, getAchievement, updateAchievement } from "../../lib/db";` and add `import type { AchievementImage } from "../../lib/types";`.

Replace the `data` object's `images: [],` placeholder and the save block. The full handler after the `action === "delete"` branch becomes:

```ts
  const category = String(form.get("category") ?? "Certification");
  const data = {
    title: String(form.get("title") ?? "").trim(),
    category: CATEGORIES.includes(category) ? category : "Certification",
    date: String(form.get("date") ?? "").trim(),
    issuer: String(form.get("issuer") ?? "").trim(),
    description: String(form.get("description") ?? "").trim(),
    credentialUrl: String(form.get("credentialUrl") ?? "").trim(),
    highlightMetric: String(form.get("highlightMetric") ?? "").trim(),
    body: String(form.get("body") ?? ""),
  };

  if (!data.title) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin?error=title" },
    });
  }

  const errorTarget =
    action === "update" && id
      ? `/admin/achievements/${id}?error=`
      : `/admin/achievements/new?error=`;

  let images: AchievementImage[] = [];
  if (action === "update" && id) {
    const existing = await getAchievement(id);
    if (existing) {
      images = existing.images.filter(
        (_, i) => String(form.get(`removeImage_${i}`)) !== "1",
      );
    }
  }

  const urlLines = String(form.get("imageUrls") ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
  for (const url of urlLines) images.push({ src: url, alt: "" });

  const uploads = form
    .getAll("images")
    .filter(
      (entry): entry is File =>
        typeof (entry as File).arrayBuffer === "function" &&
        (entry as File).size > 0,
    );

  const MAX_BYTES = 5 * 1024 * 1024;
  try {
    for (const file of uploads) {
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length > MAX_BYTES) throw new Error("size");
      const sharp = (await import("sharp")).default;
      const resized = await sharp(bytes)
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      images.push({
        src: `data:image/jpeg;base64,${resized.toString("base64")}`,
        alt: data.title,
      });
    }
  } catch (err) {
    const code = (err as Error).message === "size" ? "image-size" : "image-invalid";
    return new Response(null, {
      status: 303,
      headers: { Location: `${errorTarget}${code}` },
    });
  }

  if (action === "update" && id) {
    await updateAchievement(id, { ...data, images });
  } else {
    await createAchievement({ ...data, images });
  }

  return new Response(null, { status: 303, headers: { Location: "/admin" } });
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: no type errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual admin check**

Run: `npm run dev`, open `/admin/achievements/new`, create an achievement with one uploaded JPG and one external URL. Confirm the "Current images" list shows both after saving and re-opening the edit page, and that checking "Remove" deletes the chosen one on save. Confirm oversize/unsupported files show the error banner.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/achievements/[id].astro src/pages/api/achievements.ts
git commit -m "feat: achievement image upload + URL input in admin"
```

---

### Task 3: AchievementCarousel component + gold token

**Files:**
- Modify: `src/styles/global.css` (add `--color-gold`)
- Create: `src/components/AchievementCarousel.astro`

**Interfaces:**
- Consumes: `AchievementImage` from Task 1.
- Produces: component with props `{ images: AchievementImage[]; title: string }`. Rendered with `client:load`. DOM contract used by its own inline script: root `[data-carousel]`, slides `[data-slide]`, dots `[data-dot]`, buttons `[data-prev]` / `[data-next]`.

- [ ] **Step 1: Add the gold token**

In `src/styles/global.css`, inside the `@theme { ... }` block add `--color-gold: #c9a227;` (after the `--color-accent-soft` line). Inside the `.dark { ... }` block add `--color-gold: #e2c25d;`.

- [ ] **Step 2: Create the component**

Create `src/components/AchievementCarousel.astro`:

```astro
---
import type { AchievementImage } from "../lib/types";
import { ChevronLeft, ChevronRight } from "@lucide/astro";

interface Props {
  images: AchievementImage[];
  title: string;
}

const { images, title } = Astro.props;
const altFor = (img: AchievementImage, idx: number) =>
  img.alt || `${title} — image ${idx + 1}`;
---

<div
  class="carousel"
  data-carousel
  role="region"
  aria-roledescription="carousel"
  aria-label={`${title} gallery`}
>
  <div class="carousel__viewport">
    {images.map((img, idx) => (
      <div
        class="carousel__slide"
        data-slide={idx}
        role="group"
        aria-roledescription="slide"
        aria-label={`Slide ${idx + 1} of ${images.length}`}
        aria-hidden={idx !== 0}
      >
        <img
          src={img.src}
          alt={altFor(img, idx)}
          loading={idx === 0 ? "eager" : "lazy"}
          decoding="async"
        />
        <span class="carousel__corner" data-corner="tl" aria-hidden="true"></span>
        <span class="carousel__corner" data-corner="tr" aria-hidden="true"></span>
        <span class="carousel__corner" data-corner="bl" aria-hidden="true"></span>
        <span class="carousel__corner" data-corner="br" aria-hidden="true"></span>
      </div>
    ))}
  </div>

  {images.length > 1 && (
    <>
      <button type="button" class="carousel__nav carousel__nav--prev" data-prev aria-label="Previous image">
        <ChevronLeft class="size-5" />
      </button>
      <button type="button" class="carousel__nav carousel__nav--next" data-next aria-label="Next image">
        <ChevronRight class="size-5" />
      </button>
      <div class="carousel__dots" role="tablist" aria-label="Choose slide">
        {images.map((_, idx) => (
          <button
            type="button"
            role="tab"
            aria-selected={idx === 0}
            aria-label={`Go to slide ${idx + 1}`}
            class={idx === 0 ? "is-active" : ""}
            data-dot={idx}
          ></button>
        ))}
      </div>
    </>
  )}
</div>

<script>
  const root = document.querySelector("[data-carousel]") as HTMLElement;
  if (root) {
    const slides = Array.from(
      root.querySelectorAll("[data-slide]"),
    ) as HTMLElement[];
    const dots = Array.from(
      root.querySelectorAll("[data-dot]"),
    ) as HTMLButtonElement[];
    const prev = root.querySelector("[data-prev]") as HTMLButtonElement | null;
    const next = root.querySelector("[data-next]") as HTMLButtonElement | null;
    let current = 0;
    let timer: number | undefined;

    function go(index: number) {
      current = (index + slides.length) % slides.length;
      slides.forEach((el, i) => {
        el.classList.toggle("is-active", i === current);
        el.setAttribute("aria-hidden", String(i !== current));
      });
      dots.forEach((el, i) => {
        el.classList.toggle("is-active", i === current);
        el.setAttribute("aria-selected", String(i === current));
      });
    }

    function start() {
      if (slides.length < 2) return;
      stop();
      timer = window.setInterval(() => go(current + 1), 4000);
    }
    function stop() {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    }

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", start);
    prev?.addEventListener("click", () => {
      go(current - 1);
      start();
    });
    next?.addEventListener("click", () => {
      go(current + 1);
      start();
    });
    dots.forEach((el, i) => {
      el.addEventListener("click", () => {
        go(i);
        start();
      });
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        go(current - 1);
        start();
      }
      if (e.key === "ArrowRight") {
        go(current + 1);
        start();
      }
    });

    if (!reduced) start();
  }
</script>

<style>
  .carousel {
    position: relative;
  }

  .carousel__viewport {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border: 1px solid var(--color-line);
    border-radius: 0.125rem;
    background: var(--color-raised);
  }

  .carousel__slide {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
  }
  .carousel__slide.is-active {
    opacity: 1;
    pointer-events: auto;
  }

  .carousel__slide img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .carousel__slide.is-active::after {
    content: "";
    position: absolute;
    inset: 0;
    border: 1px solid var(--color-gold);
    border-radius: 0.125rem;
    pointer-events: none;
  }

  .carousel__corner {
    position: absolute;
    width: 14px;
    height: 14px;
    opacity: 0;
    pointer-events: none;
  }
  .carousel__slide.is-active .carousel__corner {
    animation: carousel-corner-twinkle 3s ease-in-out infinite;
  }
  .carousel__corner[data-corner="tl"] {
    top: 6px;
    left: 6px;
    border-top: 2px solid var(--color-gold);
    border-left: 2px solid var(--color-gold);
    border-top-left-radius: 2px;
  }
  .carousel__corner[data-corner="tr"] {
    top: 6px;
    right: 6px;
    border-top: 2px solid var(--color-gold);
    border-right: 2px solid var(--color-gold);
    border-top-right-radius: 2px;
    animation-delay: 0.5s;
  }
  .carousel__corner[data-corner="bl"] {
    bottom: 6px;
    left: 6px;
    border-bottom: 2px solid var(--color-gold);
    border-left: 2px solid var(--color-gold);
    border-bottom-left-radius: 2px;
    animation-delay: 1s;
  }
  .carousel__corner[data-corner="br"] {
    bottom: 6px;
    right: 6px;
    border-bottom: 2px solid var(--color-gold);
    border-right: 2px solid var(--color-gold);
    border-bottom-right-radius: 2px;
    animation-delay: 1.5s;
  }

  @keyframes carousel-corner-twinkle {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }

  .carousel__nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 9999px;
    border: 1px solid var(--color-line);
    background: var(--color-raised);
    color: var(--color-ink);
    cursor: pointer;
    opacity: 0.9;
    transition: border-color 0.2s, color 0.2s, opacity 0.2s;
  }
  .carousel__nav:hover {
    border-color: var(--color-gold);
    color: var(--color-gold);
  }
  .carousel__nav--prev {
    left: 1rem;
  }
  .carousel__nav--next {
    right: 1rem;
  }

  .carousel__dots {
    position: absolute;
    bottom: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.4rem;
  }
  .carousel__dots button {
    width: 0.5rem;
    height: 0.5rem;
    padding: 0;
    border-radius: 9999px;
    border: 1px solid var(--color-gold);
    background: transparent;
    cursor: pointer;
  }
  .carousel__dots button.is-active {
    background: var(--color-gold);
  }

  .no-motion .carousel__slide {
    transition: none;
  }
  .no-motion .carousel__slide.is-active .carousel__corner {
    animation: none;
  }
</style>
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: no type errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css src/components/AchievementCarousel.astro
git commit -m "feat: achievement image carousel with gold frame"
```

---

### Task 4: Achievement detail page

**Files:**
- Create: `src/pages/achievements/[id].astro`

**Interfaces:**
- Consumes: `AchievementCarousel` from Task 3 (props `{ images: AchievementImage[]; title: string }`, rendered with `client:load`); `getAchievement` and `renderMarkdown` from existing libs.
- Produces: public route `/achievements/[id]/` rendering header + carousel + body markdown.

- [ ] **Step 1: Create the page**

Create `src/pages/achievements/[id].astro`:

```astro
---
import BaseLayout from "../../layouts/BaseLayout.astro";
import { ArrowLeft, ArrowUpRight } from "@lucide/astro";
import AchievementCarousel from "../../components/AchievementCarousel.astro";
import { getAchievement } from "../../lib/db";
import { renderMarkdown } from "../../lib/markdown";

const id = Astro.params.id ?? "";
const achievement = await getAchievement(id);

if (!achievement) {
  return Astro.redirect("/");
}

const html = renderMarkdown(achievement.body);
const firstImage = achievement.images[0];
const ogImage = firstImage?.src.startsWith("http")
  ? firstImage.src
  : undefined;
---

<BaseLayout
  title={achievement.title}
  description={achievement.description}
  image={ogImage}
  type="article"
>
  <article class="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
    <a
      href="/#achievements"
      class="link-sweep inline-flex items-center gap-1.5 text-sm font-medium text-muted"
    >
      <ArrowLeft class="size-4" />
      All milestones
    </a>

    <header class="mt-8" data-reveal>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span class="font-semibold uppercase tracking-[0.16em] text-accent">
          {achievement.category}
        </span>
        {achievement.date && <span class="text-faint">{achievement.date}</span>}
      </div>
      <h1 class="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink text-balance sm:text-4xl md:text-5xl">
        {achievement.title}
      </h1>
      {achievement.issuer && (
        <p class="mt-3 text-sm text-faint">{achievement.issuer}</p>
      )}
      <p class="mt-4 text-lg text-muted">{achievement.description}</p>
      <div class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {achievement.highlightMetric && (
          <span class="font-mono font-medium text-accent">
            {achievement.highlightMetric}
          </span>
        )}
        {achievement.credentialUrl && (
          <a
            href={achievement.credentialUrl}
            rel="noopener noreferrer"
            target="_blank"
            class="link-sweep inline-flex items-center gap-1.5 font-medium text-muted hover:text-ink"
          >
            Verify
            <ArrowUpRight class="size-4" />
          </a>
        )}
      </div>
    </header>

    {achievement.images.length > 0 && (
      <div data-reveal class="mt-10">
        <AchievementCarousel
          images={achievement.images}
          title={achievement.title}
          client:load
        />
      </div>
    )}

    {html && (
      <div
        data-reveal
        class="prose mt-10 max-w-none prose-headings:font-serif prose-a:font-medium"
        set:html={html}
      />
    )}
  </article>
</BaseLayout>
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: no type errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual browser check**

Run: `npm run dev`. Open `/achievements/<id>/` for an achievement created in Task 2. Confirm: header renders, carousel autoplays (~4s), pauses on hover, arrows/dots/keyboard navigate, the active image shows the gold hairline + twinkling corner sparkles, and body Notes markdown renders below when present.

- [ ] **Step 4: Commit**

```bash
git add src/pages/achievements/[id].astro
git commit -m "feat: achievement detail page with carousel"
```

---

### Task 5: Achievement card links to detail page

**Files:**
- Modify: `src/components/AchievementCard.astro`

**Interfaces:**
- Consumes: `Achievement.images` from Task 1.
- Produces: cards whose title links to `/achievements/{achievement.id}/`.

- [ ] **Step 1: Link the card**

In `src/components/AchievementCard.astro`, replace the `h3` block:

```astro
    <h3 class="mt-2.5 font-serif text-lg font-semibold text-ink">
      {achievement.title}
    </h3>
```

with a linked title plus a trailing arrow (mirroring `ProjectCard.astro`):

```astro
    <div class="mt-2.5 flex items-start justify-between gap-4">
      <h3 class="font-serif text-lg font-semibold text-ink">
        <a
          href={`/achievements/${achievement.id}/`}
          class="transition hover:text-accent"
        >
          {achievement.title}
        </a>
      </h3>
      <a
        href={`/achievements/${achievement.id}/`}
        aria-label={`${achievement.title} — details`}
        class="mt-1 shrink-0 text-faint transition group-hover:text-accent"
      >
        <ArrowUpRight class="size-5" />
      </a>
    </div>
```

and add `group` to the card's inner div (`class="group py-6 sm:py-7"`), then inside the meta row (after the Verify link block) add an image-count hint:

```astro
      {achievement.images.length > 0 && (
        <span class="text-xs text-faint">
          {achievement.images.length} image{achievement.images.length === 1 ? "" : "s"}
        </span>
      )}
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: no type errors.

Run: `npm run build`
Expected: build succeeds.

Run: `npm run dev`; on the homepage the milestone cards should link to their detail pages and show an image count when images exist.

- [ ] **Step 3: Commit**

```bash
git add src/components/AchievementCard.astro
git commit -m "feat: milestone cards link to achievement detail pages"
```