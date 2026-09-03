# Dynamic Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make homepage Stack editable from /admin with full category/item control, stored as settings JSON.

**Architecture:** Store `Record<string,string[]>` as `settings.skills` JSON. Add `getSkills()` with fallback to static defaults. `TechStack` takes optional prop. New `/admin/stack` editor + `/api/skills` POST with validation. Seed defaults via `INSERT OR IGNORE`.

**Tech Stack:** Astro 7, TypeScript, libsql/Turso (`file:./local.db` fallback), vanilla JS in admin, sharp not needed.

## Global Constraints

- Preserve existing visual design of `TechStack.astro` grid — no styling change.
- Max 10 categories, max 30 items per category, category name 1-30 chars, item 1-60 chars.
- Auth via `isAuthorized(cookieHeader, passwordHash)` — same as `src/pages/api/settings.ts`.
- Rate-limit covered by existing `src/middleware.ts` — no new limit code.
- YAGNI: no icons, no drag-drop, no public API, no dedicated table.

---

### Task 1: DB helper `getSkills()` + sanitizer

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/data/skills.ts` (add type export only if needed, no data change)

**Interfaces:**
- Consumes: existing `getSettings(): Promise<Record<string,string>>`, `skills` static default.
- Produces: `export async function getSkills(): Promise<Record<string,string[]>>` and `export function sanitizeSkills(input: unknown): Record<string,string[]> | null` used by Task 4.

- [ ] **Step 1: Add sanitizer + getSkills to end of `src/lib/db.ts`**

```typescript
import { skills as defaultSkills } from "../data/skills";

export function sanitizeSkills(input: unknown): Record<string, string[]> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Record<string, string[]> = {};
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 10) return null;
  for (const [rawKey, rawVal] of entries) {
    const key = String(rawKey).trim().slice(0, 30);
    if (!key || !Array.isArray(rawVal)) return null;
    const items = (rawVal as unknown[])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .map((v) => v.slice(0, 60))
      .slice(0, 30);
    if (items.length === 0) continue;
    out[key] = items;
  }
  if (Object.keys(out).length === 0) return null;
  return out;
}

export async function getSkills(): Promise<Record<string, string[]>> {
  try {
    const settings = await getSettings();
    const raw = settings["skills"];
    if (!raw) return defaultSkills;
    const parsed: unknown = JSON.parse(raw);
    return sanitizeSkills(parsed) ?? defaultSkills;
  } catch {
    return defaultSkills;
  }
}
```

Place after `saveSettings` function. Add import at top alongside existing `import type { Achievement... }`.

- [ ] **Step 2: Typecheck file**

Run: `npx astro check --minimumSeverity error`
Expected: PASS with no errors in `db.ts`. If import cycle warning appears, move `defaultSkills` import inline via `await import` — but static import is fine (skills.ts has no deps).

- [ ] **Step 3: Smoke verify with node**

Run: `node --input-type=module -e "import('./src/lib/db.ts').catch(e=>console.log('ts-not-runnable-ok'))"`
Expected: error about TS (ok) — real verification is Task 3 build. Alternatively skip; build covers it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add getSkills and sanitizeSkills with fallback"
```

### Task 2: Seed default skills JSON

**Files:**
- Modify: `scripts/seed.mjs`

**Interfaces:**
- Consumes: `sanitizeSkills` logic implicitly (seed writes clean JSON), `src/data/skills.ts` values hardcoded.
- Produces: `settings.skills` row in DB for fresh + existing DBs.

- [ ] **Step 1: Add skills seeding after DEFAULT_SETTINGS loop**

In `scripts/seed.mjs` after the `for (const [key, value] of Object.entries(DEFAULT_SETTINGS))` block (around line 141), insert:

```javascript
const DEFAULT_SKILLS = {
  Frontend: ["TypeScript", "React", "Next.js", "Astro", "Tailwind CSS", "Vue"],
  Backend: ["Node.js", "Python", "Go", "PostgreSQL", "Redis", "GraphQL"],
  DevOps: ["AWS", "Docker", "Kubernetes", "Terraform", "GitHub Actions", "Vercel"],
  Tools: ["Git", "VS Code", "Figma", "Jest", "Vitest", "Playwright"],
};

await db.execute({
  sql: `INSERT OR IGNORE INTO settings (key, value) VALUES ('skills', ?)`,
  args: [JSON.stringify(DEFAULT_SKILLS)],
});
console.log("seeded skills (if missing)");
```

Keep `DEFAULT_SKILLS` in sync with `src/data/skills.ts` manually.

- [ ] **Step 2: Run seed against local DB copy**

Run: `node --env-file=.env scripts/seed.mjs`
Expected: output contains `seeded skills (if missing)` and `seed complete → file:./local.db`. Re-run: should still say same without duplicating (IGNORE).

- [ ] **Step 3: Verify row exists**

Run: `node -e "import('@libsql/client').then(async ({createClient})=>{const db=createClient({url:'file:./local.db'});const r=await db.execute(\"SELECT value FROM settings WHERE key='skills'\");console.log('rows:',r.rows.length);console.log(String(r.rows[0]?.value).slice(0,80));})"`
Expected: `rows: 1` and JSON starting `{"Frontend":...`.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.mjs
git commit -m "chore: seed default skills JSON"
```

### Task 3: TechStack prop + homepage wiring

**Files:**
- Modify: `src/components/TechStack.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `getSkills()` from Task 1.
- Produces: `TechStack` accepts `skills` prop; homepage passes DB value.

- [ ] **Step 1: Update `src/components/TechStack.astro` to accept prop**

Replace entire file content with:

```astro
---
import { skills as fallbackSkills } from "../data/skills";

interface Props {
  skills?: Record<string, string[]>;
}

const { skills = fallbackSkills } = Astro.props;
---

<div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
  {Object.entries(skills).map(([category, items], index) => (
    <div data-reveal data-reveal-delay={index * 0.06}>
      <h3 class="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
        {category}
      </h3>
      <ul class="mt-4 space-y-2.5 border-t border-line pt-4">
        {items.map((item) => (
          <li class="text-sm text-muted">{item}</li>
        ))}
      </ul>
    </div>
  ))}
</div>
```

No visual change; only prop added.

- [ ] **Step 2: Update `src/pages/index.astro` frontmatter + usage**

Change import line `import { listAchievements, listProjects } from "../lib/db";` to:

```typescript
import { getSkills, listAchievements, listProjects } from "../lib/db";
```

After `const achievements = ...` block add:

```typescript
const skills = await getSkills();
```

Change `<TechStack />` to `<TechStack skills={skills} />`.

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: PASS, `dist/index.html` contains `TypeScript` and `Tailwind CSS`.

- [ ] **Step 4: Commit**

```bash
git add src/components/TechStack.astro src/pages/index.astro
git commit -m "feat: render stack from DB with fallback"
```

### Task 4: POST `/api/skills.ts`

**Files:**
- Create: `src/pages/api/skills.ts`

**Interfaces:**
- Consumes: `isAuthorized` from `src/lib/auth.ts`, `getSettings/saveSettings/sanitizeSkills` from `src/lib/db.ts`.
- Produces: POST endpoint returning 303 redirects; consumed by Task 5 form.

- [ ] **Step 1: Create file `src/pages/api/skills.ts`**

```typescript
import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth";
import { getSettings, sanitizeSkills, saveSettings } from "../../lib/db";

export const POST: APIRoute = async ({ request }) => {
  const settings = await getSettings();
  const hash = settings["password_hash"] || undefined;
  if (!isAuthorized(request.headers.get("cookie"), hash)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const form = await request.formData();
  const raw = String(form.get("skills") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/stack?error=invalid" },
    });
  }
  const cleaned = sanitizeSkills(parsed);
  if (!cleaned) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/stack?error=invalid" },
    });
  }
  await saveSettings({ skills: JSON.stringify(cleaned) });
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/stack?saved=1" },
  });
};
```

Matches pattern of `src/pages/api/settings.ts:5-10` for auth with password_hash.

- [ ] **Step 2: Typecheck**

Run: `npx astro check --minimumSeverity error`
Expected: PASS, no errors in new file.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/skills.ts
git commit -m "feat: add skills save API with validation"
```

### Task 5: Admin editor `/admin/stack.astro`

**Files:**
- Create: `src/pages/admin/stack.astro`

**Interfaces:**
- Consumes: `getSkills()` from Task 1, POST `/api/skills` from Task 4.
- Produces: Admin UI at `/admin/stack`; no exports.

- [ ] **Step 1: Create file with server frontmatter + form shell**

```astro
---
import AdminLayout from "../../layouts/AdminLayout.astro";
import { getSkills } from "../../lib/db";

const skills = await getSkills();
const saved = Astro.url.searchParams.get("saved");
const error = Astro.url.searchParams.get("error");
const initialJson = JSON.stringify(skills);
---

<AdminLayout title="Edit stack">
  <a href="/admin" class="text-sm text-muted transition hover:text-ink">← Back to admin</a>
  <h1 class="mt-4 font-serif text-2xl font-semibold text-ink">Stack</h1>
  <p class="mt-2 text-sm text-muted">Rename, add, remove, or reorder categories and items. Changes go live immediately.</p>

  {saved && (
    <p class="mt-4 rounded-sm border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>
  )}
  {error === "invalid" && (
    <p class="mt-4 rounded-sm border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent">That data looked invalid. Keep 1–10 categories, 1–30 items each.</p>
  )}

  <form id="stack-form" method="post" action="/api/skills" class="mt-8 space-y-6">
    <input type="hidden" name="skills" id="skills-payload" value={initialJson} />
    <div id="categories" class="space-y-6"></div>
    <div class="flex flex-wrap gap-3">
      <button type="button" id="add-category" class="rounded-sm border border-line bg-raised px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent">+ Add category</button>
      <button type="submit" class="rounded-sm bg-accent px-5 py-2 text-sm font-semibold text-surface transition hover:opacity-90">Save stack</button>
    </div>
  </form>

  <script define:vars={{ initialJson }}>
    const initial = JSON.parse(initialJson);
    const wrap = document.getElementById("categories");
    const payload = document.getElementById("skills-payload");
    const form = document.getElementById("stack-form");

    function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

    function render() {
      wrap.innerHTML = "";
      const cats = JSON.parse(payload.value || "{}");
      Object.entries(cats).forEach(([cat, items], ci) => {
        const div = document.createElement("div");
        div.className = "rounded-sm border border-line bg-raised p-4";
        div.innerHTML = `
          <div class="flex items-center gap-2">
            <input data-cat="${ci}" value="${esc(cat)}" maxlength="30"
              class="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink focus:border-accent focus:outline-none" />
            <button type="button" data-up="${ci}" title="Move up" class="px-2 py-1 text-sm text-muted hover:text-accent">↑</button>
            <button type="button" data-down="${ci}" title="Move down" class="px-2 py-1 text-sm text-muted hover:text-accent">↓</button>
            <button type="button" data-delcat="${ci}" class="px-2 py-1 text-xs text-faint hover:text-accent">Delete</button>
          </div>
          <div class="mt-3 space-y-2" data-items="${ci}"></div>
          <button type="button" data-additem="${ci}" class="mt-3 text-xs font-semibold text-accent hover:opacity-80">+ Add item</button>`;
        wrap.appendChild(div);
        const list = div.querySelector(`[data-items="${ci}"]`);
        (items).forEach((it, ii) => {
          const row = document.createElement("div");
          row.className = "flex items-center gap-2";
          row.innerHTML = `
            <input data-item="${ci}-${ii}" value="${esc(it)}" maxlength="60"
              class="w-full rounded-sm border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none" />
            <button type="button" data-delitem="${ci}-${ii}" class="shrink-0 px-2 py-1 text-xs text-faint hover:text-accent">×</button>`;
          list.appendChild(row);
        });
      });
    }

    function collect() {
      const cats = JSON.parse(payload.value || "{}");
      const keys = Object.keys(cats);
      const next = {};
      document.querySelectorAll('#categories > div').forEach((div, newCi) => {
        const catInput = div.querySelector('input[data-cat]');
        const name = catInput.value.trim().slice(0, 30);
        if (!name) return;
        const vals = [];
        div.querySelectorAll('input[data-item]').forEach((inp) => {
          const v = inp.value.trim().slice(0, 60);
          if (v) vals.push(v);
        });
        if (vals.length) next[name] = vals.slice(0, 30);
      });
      void keys;
      payload.value = JSON.stringify(next);
      return next;
    }

    wrap.addEventListener("input", (e) => { collect(); });
    wrap.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      let data = JSON.parse(payload.value || "{}");
      let keys = Object.keys(data);
      if (t.hasAttribute("data-delcat")) {
        const i = Number(t.getAttribute("data-delcat"));
        delete data[keys[i]];
      } else if (t.hasAttribute("data-up")) {
        const i = Number(t.getAttribute("data-up"));
        if (i > 0) {
          const entries = Object.entries(data);
          [entries[i-1], entries[i]] = [entries[i], entries[i-1]];
          data = Object.fromEntries(entries);
        }
      } else if (t.hasAttribute("data-down")) {
        const i = Number(t.getAttribute("data-down"));
        const entries = Object.entries(data);
        if (i < entries.length - 1) {
          [entries[i+1], entries[i]] = [entries[i], entries[i+1]];
          data = Object.fromEntries(entries);
        }
      } else if (t.hasAttribute("data-additem")) {
        const i = Number(t.getAttribute("data-additem"));
        data[keys[i]] = [...(data[keys[i]] || []), ""].slice(0, 30);
        payload.value = JSON.stringify(data);
        render();
        const last = wrap.querySelector(`[data-items="${i}"] input:last-child`);
        if (last) last.focus();
        return;
      } else if (t.hasAttribute("data-delitem")) {
        const [ci, ii] = t.getAttribute("data-delitem").split("-").map(Number);
        const k = keys[ci];
        data[k] = data[k].filter((_, idx) => idx !== ii);
        if (!data[k].length) data[k] = [""];
      } else return;
      payload.value = JSON.stringify(data);
      collect();
      render();
      collect();
    });

    document.getElementById("add-category").addEventListener("click", () => {
      const data = JSON.parse(payload.value || "{}");
      if (Object.keys(data).length >= 10) return;
      let n = "New category";
      let c = 2;
      while (data[n]) { n = `New category ${c++}`; }
      data[n] = [""];
      payload.value = JSON.stringify(data);
      render();
    });

    form.addEventListener("submit", () => { collect(); });
    render();
  </script>
</AdminLayout>
```

Styling matches `src/pages/admin/settings.astro:43-60` input classes. Limits enforced client + server.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS, route `/admin/stack` prerendered or server-rendered without error.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/stack.astro
git commit -m "feat: add admin stack editor"
```

### Task 6: Link + end-to-end verification

**Files:**
- Modify: `src/pages/admin/index.astro`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: navigable link; verified live update.

- [ ] **Step 1: Add link after settings link in `src/pages/admin/index.astro:17-21`**

Old:
```astro
  <a
    href="/admin/settings"
    class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:opacity-80"
  >
    Edit site details (name, photo, links) →
  </a>
```

New:
```astro
  <div class="mt-4 flex flex-wrap gap-5">
    <a
      href="/admin/settings"
      class="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:opacity-80"
    >
      Edit site details (name, photo, links) →
    </a>
    <a
      href="/admin/stack"
      class="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:opacity-80"
    >
      Edit stack →
    </a>
  </div>
```

- [ ] **Step 2: Final build + manual check**

Run: `npm run build`
Expected: PASS.

Manual: `npm run dev`, visit `/`, confirm Stack shows DB values; visit `/admin/stack`, rename one item, Save, revisit `/` to confirm change; delete `skills` key via `node -e` and confirm fallback renders.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/index.astro
git commit -m "feat: link stack editor from admin"
```
