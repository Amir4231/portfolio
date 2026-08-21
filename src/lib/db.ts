import { createClient } from "@libsql/client";
import type { Achievement, Project } from "./types";

const url =
  (process.env.TURSO_DATABASE_URL as string | undefined) ??
  (import.meta.env.TURSO_DATABASE_URL as string | undefined) ??
  "file:./local.db";
const authToken =
  (process.env.TURSO_AUTH_TOKEN as string | undefined) ??
  (import.meta.env.TURSO_AUTH_TOKEN as string | undefined);

export const db = createClient({ url, authToken });

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
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);
`;

export async function initSchema(): Promise<void> {
  await db.executeMultiple(SCHEMA);
}

let readyPromise: Promise<void> | null = null;

/** Run schema init exactly once per process, then memoize. */
export function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = initSchema().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return slug || "untitled";
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ""),
    pubDate: String(row.pub_date ?? ""),
    tags: JSON.parse(String(row.tags ?? "[]")) as string[],
    heroImage: String(row.hero_image ?? ""),
    githubUrl: String(row.github_url ?? ""),
    liveUrl: String(row.live_url ?? ""),
    featured: Number(row.featured) === 1,
    body: String(row.body ?? ""),
  };
}

function rowToAchievement(row: Record<string, unknown>): Achievement {
  return {
    id: String(row.id),
    title: String(row.title),
    category: String(row.category ?? "Certification"),
    date: String(row.date ?? ""),
    issuer: String(row.issuer ?? ""),
    description: String(row.description ?? ""),
    credentialUrl: String(row.credential_url ?? ""),
    highlightMetric: String(row.highlight_metric ?? ""),
    body: String(row.body ?? ""),
  };
}

export async function listProjects(): Promise<Project[]> {
  const res = await db.execute("SELECT * FROM projects ORDER BY pub_date DESC");
  return res.rows.map((r) => rowToProject(r as Record<string, unknown>));
}

export async function getProject(id: string): Promise<Project | null> {
  const res = await db.execute({
    sql: "SELECT * FROM projects WHERE id = ?",
    args: [id],
  });
  return res.rows.length ? rowToProject(res.rows[0] as Record<string, unknown>) : null;
}

export async function createProject(
  data: Omit<Project, "id">,
): Promise<string> {
  let id = slugify(data.title);
  if (await getProject(id)) id = `${id}-${Date.now().toString(36)}`;
  await db.execute({
    sql: `INSERT INTO projects (id, title, description, pub_date, tags, hero_image, github_url, live_url, featured, body)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.title,
      data.description,
      data.pubDate,
      JSON.stringify(data.tags),
      data.heroImage,
      data.githubUrl,
      data.liveUrl,
      data.featured ? 1 : 0,
      data.body,
    ],
  });
  return id;
}

export async function updateProject(
  id: string,
  data: Omit<Project, "id">,
): Promise<void> {
  await db.execute({
    sql: `UPDATE projects SET title = ?, description = ?, pub_date = ?, tags = ?,
          hero_image = ?, github_url = ?, live_url = ?, featured = ?, body = ?
          WHERE id = ?`,
    args: [
      data.title,
      data.description,
      data.pubDate,
      JSON.stringify(data.tags),
      data.heroImage,
      data.githubUrl,
      data.liveUrl,
      data.featured ? 1 : 0,
      data.body,
      id,
    ],
  });
}

export async function deleteProject(id: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM projects WHERE id = ?", args: [id] });
}

export async function listAchievements(): Promise<Achievement[]> {
  const res = await db.execute("SELECT * FROM achievements ORDER BY created_at DESC");
  return res.rows.map((r) => rowToAchievement(r as Record<string, unknown>));
}

export async function getAchievement(id: string): Promise<Achievement | null> {
  const res = await db.execute({
    sql: "SELECT * FROM achievements WHERE id = ?",
    args: [id],
  });
  return res.rows.length
    ? rowToAchievement(res.rows[0] as Record<string, unknown>)
    : null;
}

export async function createAchievement(
  data: Omit<Achievement, "id">,
): Promise<string> {
  let id = slugify(data.title);
  if (await getAchievement(id)) id = `${id}-${Date.now().toString(36)}`;
  await db.execute({
    sql: `INSERT INTO achievements (id, title, category, date, issuer, description, credential_url, highlight_metric, body)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.title,
      data.category,
      data.date,
      data.issuer,
      data.description,
      data.credentialUrl,
      data.highlightMetric,
      data.body,
    ],
  });
  return id;
}

export async function updateAchievement(
  id: string,
  data: Omit<Achievement, "id">,
): Promise<void> {
  await db.execute({
    sql: `UPDATE achievements SET title = ?, category = ?, date = ?, issuer = ?,
          description = ?, credential_url = ?, highlight_metric = ?, body = ?
          WHERE id = ?`,
    args: [
      data.title,
      data.category,
      data.date,
      data.issuer,
      data.description,
      data.credentialUrl,
      data.highlightMetric,
      data.body,
      id,
    ],
  });
}

export async function deleteAchievement(id: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM achievements WHERE id = ?", args: [id] });
}

export async function getSettings(): Promise<Record<string, string>> {
  const res = await db.execute("SELECT key, value FROM settings");
  const out: Record<string, string> = {};
  for (const row of res.rows as Record<string, unknown>[]) {
    out[String(row.key)] = String(row.value ?? "");
  }
  return out;
}

export async function saveSettings(
  values: Record<string, string>,
): Promise<void> {
  const stmt = db.batch([
    ...Object.entries(values).map(([key, value]) => ({
      sql: `INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [key, value],
    })),
  ]);
  await stmt;
}
