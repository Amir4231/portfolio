import { createClient } from "@libsql/client";
import matter from "gray-matter";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

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
  images TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
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

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
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

const DEFAULT_SETTINGS = {
  name: "Alex Chen",
  role: "Full-Stack Engineer",
  location: "San Francisco, CA",
  email: "hello@example.com",
  github: "https://github.com/your-username",
  linkedin: "https://www.linkedin.com/in/your-username",
  twitter: "https://twitter.com/your-username",
  resume: "/resume.pdf",
  tagline:
    "Full-stack engineer with 6+ years shipping production TypeScript, React, and Node.js applications. I obsess over performance, accessibility, and developer experience — turning complex problems into fast, elegant products.",
  builtWith: "Built with Astro + Tailwind",
};

for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  await db.execute({
    sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
    args: [key, value],
  });
}

const existing = await db.execute("SELECT value FROM settings WHERE key = 'password_hash'");
if (existing.rows.length === 0) {
  const initial = process.env.ADMIN_PASSWORD || "admin";
  await db.execute({
    sql: `INSERT OR IGNORE INTO settings (key, value) VALUES ('password_hash', ?)`,
    args: [hashPassword(initial)],
  });
  console.log(`seeded password_hash from ADMIN_PASSWORD (${initial === "admin" ? "default 'admin'" : "env"})`);
} else {
  console.log("password_hash already exists, keeping it");
}

console.log("seed complete →", url);