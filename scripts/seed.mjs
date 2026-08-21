import { createClient } from "@libsql/client";
import matter from "gray-matter";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pub_date TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  hero_image TEXT NOT NULL DEFAULT '',
  github_url TEXT NOT NULL DEFAULT '',
  live_url TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Certification',
  date TEXT NOT NULL DEFAULT '',
  issuer TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  credential_url TEXT NOT NULL DEFAULT '',
  highlight_metric TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function slugify(title) {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return slug || "untitled";
}

function toIsoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "");
}

async function seedCollection(folder, buildInsert) {
  const dir = join(root, "src", "content", folder);
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".mdx"));
  } catch {
    console.log(`no ${folder} folder, skipping`);
    return;
  }

  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf8");
    const { data, content } = matter(raw);
    const { sql, args } = buildInsert(data, content.trim());
    await db.execute({ sql, args });
    console.log(`seeded ${folder}:`, slugify(data.title));
  }
}

await db.executeMultiple(SCHEMA);

await seedCollection("projects", (data, body) => ({
  sql: `INSERT OR IGNORE INTO projects (id, title, description, pub_date, tags, hero_image, github_url, live_url, featured, body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  args: [
    slugify(data.title),
    String(data.title ?? "Untitled"),
    String(data.description ?? ""),
    toIsoDate(data.pubDate),
    JSON.stringify(Array.isArray(data.tags) ? data.tags.map(String) : []),
    String(data.heroImage ?? ""),
    String(data.githubUrl ?? ""),
    String(data.liveUrl ?? ""),
    data.featured ? 1 : 0,
    body,
  ],
}));

await seedCollection("achievements", (data, body) => ({
  sql: `INSERT OR IGNORE INTO achievements (id, title, category, date, issuer, description, credential_url, highlight_metric, body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  args: [
    slugify(data.title),
    String(data.title ?? "Untitled"),
    String(data.category ?? "Certification"),
    String(data.date ?? ""),
    String(data.issuer ?? ""),
    String(data.description ?? ""),
    String(data.credentialUrl ?? ""),
    String(data.highlightMetric ?? ""),
    body,
  ],
}));

console.log("seed complete →", url);
