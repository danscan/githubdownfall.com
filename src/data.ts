import db, { cached } from "./db";

// –
// Types
// –

/** A GitHub Status incident. */
export interface Incident {
  created_at: string;
  id: string;
  impact: string;
  name: string;
  resolved_at: string | null;
  shortlink: string;
  started_at: string;
  status: string;
  updated_at: string;
}

/** Incident severity level. */
export type Impact = "critical" | "major" | "minor" | "none";

/** Severity weights per impact level. */
export const impactWeights: Record<Impact, number> = {
  critical: 4,
  major: 3,
  minor: 2,
  none: 1,
};

/** A day cell in the heatmap grid. */
export interface HeatmapDay {
  count: number;
  date: string;
  incidents: Incident[];
  severity: number;
}

// –
// Status
// –

interface StatusResponse {
  status: { description: string; indicator: string };
}

export interface UnresolvedResponse {
  incidents: (Incident & { incident_updates: { body: string }[] })[];
}

const toJSON = (r: Response) => r.json();

/** Fetch live status from GitHub, sync recent incidents to DB. */
export async function sync() {
  const [status, unresolved, result] = await Promise.all([
    cached<StatusResponse>(
      "status",
      () => fetch("https://www.githubstatus.com/api/v2/status.json").then(toJSON),
    ),
    cached<UnresolvedResponse>(
      "unresolved",
      () => fetch("https://www.githubstatus.com/api/v2/incidents/unresolved.json").then(toJSON),
    ),
    cached<{ incidents: Incident[] }>(
      "incidents",
      () => fetch("https://www.githubstatus.com/api/v2/incidents.json").then(toJSON),
    ),
  ]);

  if (result) {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO incidents
      (id, name, status, created_at, updated_at, resolved_at, impact, shortlink, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const incident of result.incidents) {
      insert.run(
        incident.id,
        incident.name,
        incident.status,
        incident.created_at,
        incident.updated_at,
        incident.resolved_at,
        incident.impact,
        incident.shortlink,
        incident.started_at,
      );
    }
  }

  return { status, unresolved };
}

// –
// Heatmap
// –

/** Build the year-long heatmap grid from all stored incidents. */
export function heatmap() {
  const incidents = db.prepare(
    `SELECT * FROM incidents ORDER BY started_at DESC`,
  ).all() as Incident[];

  // Group by day
  const dayMap = new Map<string, { incidents: Incident[]; severity: number }>();

  for (const incident of incidents) {
    const dayKey = new Date(incident.started_at).toISOString().split("T")[0];
    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, { severity: 0, incidents: [] });
    }

    const day = dayMap.get(dayKey)!;
    day.severity += impactWeights[incident.impact as Impact] || 1;
    day.incidents.push(incident);
  }

  // Generate last year of days
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  const weeks: HeatmapDay[][] = [];
  let currentWeek: HeatmapDay[] = [];
  let currentDate = new Date(oneYearAgo);

  // Start on Sunday
  currentDate.setDate(currentDate.getDate() - currentDate.getDay());

  while (currentDate <= today) {
    const dayKey = currentDate.toISOString().split("T")[0];
    const dayData = dayMap.get(dayKey);

    currentWeek.push({
      date: dayKey,
      severity: dayData?.severity || 0,
      count: dayData?.incidents.length || 0,
      incidents: dayData?.incidents || [],
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (currentWeek.length > 0) weeks.push(currentWeek);

  const maxSeverity = Math.max(
    ...Array.from(dayMap.values()).map((d) => d.severity),
    1,
  );

  return { dayMap, incidents, maxSeverity, weeks };
}
