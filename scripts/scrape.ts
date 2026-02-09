/**
 * Backfill script: scrapes githubstatus.com history pages for all incidents
 * from 2025 onward and upserts them into the local SQLite database.
 *
 * Run once with: bun scrape.ts
 */
import { Database } from "bun:sqlite";

const HISTORY_URL = "https://www.githubstatus.com/history";
const INCIDENT_URL = "https://www.githubstatus.com/api/v2/incidents";
const CUTOFF_YEAR = 2025;

// Pages 1-5 cover Feb 2026 back to Dec 2024 (3 months per page).
const PAGES = [1, 2, 3, 4, 5];

interface HistoryIncident {
  code: string;
  impact: string;
  name: string;
}

interface HistoryMonth {
  days: number;
  incidents: HistoryIncident[];
  name: string;
  starts_on: number;
  year: number;
}

// –
// Database
// –

const db = new Database("incidents.db");

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

const existing = new Set(
  db
    .prepare("SELECT id FROM incidents")
    .all()
    .map((row: Record<string, string>) => row.id)
);

const insert = db.prepare(`
  INSERT OR REPLACE INTO incidents
  (id, name, status, created_at, updated_at, resolved_at, impact, shortlink, started_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// –
// Scrape history pages
// –

/** Extract the embedded months JSON from a history page's HTML. */
function parseMonths(html: string): HistoryMonth[] {
  const match = html.match(/&quot;months&quot;:\[(.*?)\],&quot;show_component_filter/);
  if (!match) return [];

  const decoded = match[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return JSON.parse(`[${decoded}]`);
}

/** Fetch full incident details from the individual incident API. */
async function fetchIncident(code: string) {
  const res = await fetch(`${INCIDENT_URL}/${code}.json`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.incident;
}

// –
// Main
// –

let codes: string[] = [];

console.log("Scraping history pages...");

for (const page of PAGES) {
  const res = await fetch(`${HISTORY_URL}?page=${page}`);
  const html = await res.text();
  const months = parseMonths(html);

  for (const month of months) {
    // Skip months before our cutoff
    if (month.year < CUTOFF_YEAR) continue;

    for (const incident of month.incidents) {
      if (!existing.has(incident.code)) {
        codes.push(incident.code);
      }
    }

    console.log(`  ${month.name} ${month.year}: ${month.incidents.length} incidents`);
  }
}

codes = [...new Set(codes)];
console.log(`\nFound ${codes.length} incidents to backfill.\n`);

// Fetch and insert in batches to be polite
const BATCH = 5;
let inserted = 0;

for (let i = 0; i < codes.length; i += BATCH) {
  const batch = codes.slice(i, i + BATCH);
  const results = await Promise.all(batch.map(fetchIncident));

  for (const incident of results) {
    if (!incident) continue;

    insert.run(
      incident.id,
      incident.name,
      incident.status,
      incident.created_at,
      incident.updated_at,
      incident.resolved_at,
      incident.impact,
      incident.shortlink,
      incident.started_at
    );
    inserted++;
  }

  process.stdout.write(`  ${Math.min(i + BATCH, codes.length)}/${codes.length}\r`);
}

console.log(`\nDone. Inserted ${inserted} incidents.`);
console.log(
  `Total in DB: ${db.prepare("SELECT COUNT(*) as count FROM incidents").get().count}`
);
