import { Database } from "bun:sqlite";

const db = new Database("incidents.db");

// –
// Schema
// –

db.run(`
  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    created_at TEXT,
    updated_at TEXT,
    resolved_at TEXT,
    impact TEXT,
    shortlink TEXT,
    started_at TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT,
    referrer TEXT,
    region TEXT,
    visited_at TEXT DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT,
    fetched_at INTEGER
  )
`);

// –
// Cache
// –

const TTL = 60_000;
const getCache = db.prepare<{ fetched_at: number; value: string }, string>(`SELECT value, fetched_at FROM cache WHERE key = ?`);
const setCache = db.prepare(`INSERT OR REPLACE INTO cache (key, value, fetched_at) VALUES (?, ?, ?)`);

/** Fetch JSON with a 60s SQLite-backed cache. Returns stale data on failure, null if no cache exists. */
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
  const row = getCache.get(key);
  if (row && Date.now() - row.fetched_at < TTL) {
    return JSON.parse(row.value) as T;
  }

  try {
    const data = await fn();
    setCache.run(key, JSON.stringify(data), Date.now());
    return data;
  } catch {
    // Stale cache is better than nothing
    return row ? JSON.parse(row.value) as T : null;
  }
}

export default db;
