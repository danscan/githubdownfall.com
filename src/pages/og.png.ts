import type { APIRoute } from "astro";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import { sync, heatmap } from "../data";
import logoSvg from "../../public/favicon-light.svg?raw";

// –
// Fonts
// –

let fontCache: { data: ArrayBuffer; name: string; style: "normal"; weight: 400 | 700 }[];

async function fonts() {
  if (fontCache) return fontCache;

  const [regular, bold] = await Promise.all([
    fetch("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff").then((r) => r.arrayBuffer()),
    fetch("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.woff").then((r) => r.arrayBuffer()),
  ]);

  fontCache = [
    { name: "Inter", data: regular, weight: 400, style: "normal" },
    { name: "Inter", data: bold, weight: 700, style: "normal" },
  ];

  return fontCache;
}

// –
// Element helper
// –

type Child = VNode | string | number;
type VNode = { key: null; props: Record<string, unknown>; type: string };

/** Shorthand for Satori VDOM nodes. `display: flex` is implicit. */
function h(type: string, style: Record<string, number | string | undefined>, ...children: (Child | Child[])[]): VNode {
  const flat = children.flat();
  return {
    type,
    key: null,
    props: {
      style: { display: "flex", ...style },
      children: flat.length <= 1 ? flat[0] : flat,
    },
  };
}

// –
// Color
// –

/** Map severity to heatmap cell color (matches home page formula). */
function cellColor(severity: number, max: number): string {
  if (severity === 0) return "#111827";
  const ratio = severity / max;
  const r = Math.min(255, Math.round(100 + ratio * 155));
  const g = Math.max(0, Math.round(50 - ratio * 50));
  const b = Math.max(0, Math.round(50 - ratio * 50));
  return `rgb(${r},${g},${b})`;
}

// –
// Image cache
// –

let cache: { buffer: Buffer; timestamp: number } | null = null;
const CACHE_TTL = 300_000; // 5 minutes

// –
// Route
// –

export const GET: APIRoute = async () => {
  // Serve cached image if fresh
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    // @ts-expect-error
    return new Response(cache.buffer, {
      headers: { "Cache-Control": "public, max-age=300", "Content-Type": "image/png" },
    });
  }

  const logoUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

  const { status, unresolved } = await sync();
  const { incidents, maxSeverity, weeks } = heatmap();

  const hasIssues = unresolved && unresolved.incidents.length > 0;
  const indicator = status?.status.indicator ?? "none";

  // Status label, color, and duration
  const statusLabel =
    indicator === "critical" ? "Critical"
    : indicator === "major" ? "Major Outage"
    : indicator === "minor" ? "Minor Outage"
    : "Normal";
  const statusColor =
    indicator === "none" ? "#22c55e"
    : indicator === "minor" ? "#f59e0b"
    : "#ef4444";
  const statusTextColor =
    indicator === "none" ? "#86efac"
    : indicator === "minor" ? "#fcd34d"
    : "#fca5a5";

  // How long the current status has been ongoing
  const now = Date.now();
  const ongoingSince = hasIssues
    ? Math.min(...unresolved!.incidents.map((i) => new Date(i.started_at).getTime()))
    : incidents.length
      ? new Date(incidents.find((i) => i.resolved_at)?.resolved_at ?? now).getTime()
      : now;
  const durationMs = now - ongoingSince;
  const durationText =
    durationMs < 3_600_000 ? `for ${Math.max(1, Math.round(durationMs / 60_000))} min`
    : durationMs < 86_400_000 ? `for ${Math.round(durationMs / 3_600_000)} hr`
    : `for ${Math.round(durationMs / 86_400_000)} days`;

  // Heatmap grid — 21 weeks with the leftmost fading off the left edge
  const FADE = [0.12, 0.3, 0.55, 0.8];
  const recentWeeks = weeks.slice(-21);
  const grid = recentWeeks.map((week, i) =>
    h(
      "div",
      { flexDirection: "column", gap: 7, opacity: i < FADE.length ? FADE[i] : 1 },
      ...week.map((day) =>
        h("div", { background: cellColor(day.severity, maxSeverity), borderRadius: 6, height: 48, width: 48 }),
      ),
    ),
  );

  // Status indicator
  const statusSection = h(
    "div",
    { alignItems: "flex-end", flexDirection: "column", flexShrink: 0 },
    h("div", { color: "#6b7280", fontSize: 24 }, "Status"),
    h(
      "div",
      { alignItems: "center", gap: 12, marginTop: 6 },
      h("div", { background: statusColor, borderRadius: 8, flexShrink: 0, height: 16, width: 16 }),
      h("div", { color: statusTextColor, fontSize: 32, fontWeight: 700 }, statusLabel),
    ),
    h("div", { color: "#6b7280", fontSize: 24, marginTop: 4 }, durationText),
  );

  // Root layout
  const root = h(
    "div",
    {
      background: "#030712",
      color: "white",
      flexDirection: "column",
      fontFamily: "Inter",
      height: 630,
      padding: 48,
      width: 1200,
    },

    // Header
    h(
      "div",
      { alignItems: "center", justifyContent: "space-between" },
      h(
        "div",
        { alignItems: "center", gap: 20 },
        { type: "img", key: null, props: { src: logoUri, height: 64, width: 66 } } satisfies VNode,
        h(
          "div",
          { flexDirection: "column" },
          h("div", { fontSize: 42, fontWeight: 700 }, "Github Downfall"),
          h("div", { color: "#9ca3af", fontSize: 22, marginTop: 4 }, "Track Github's incidents and downtime"),
        ),
      ),
      statusSection,
    ),

    // Heatmap (shifted left so first column overflows the edge)
    h("div", { gap: 7, marginLeft: -55, marginTop: 36 }, ...grid),
  );

  // Render
  const svg = await satori(root as React.ReactNode, {
    width: 1200,
    height: 630,
    fonts: await fonts(),
  });

  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();

  cache = { buffer: png, timestamp: Date.now() };

  // @ts-expect-error
  return new Response(png, {
    headers: { "Cache-Control": "public, max-age=300", "Content-Type": "image/png" },
  });
};
