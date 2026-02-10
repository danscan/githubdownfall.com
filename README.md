# GitHub Downfall

Track GitHub's historical incidents and downtime. A contribution graph-style heatmap of every GitHub incident since January 2025, with trend analysis and live status.

Built with Astro, Tailwind, and Bun SQLite.

## Setup

```sh
bun install
bun run scrape.ts  # backfill incidents from 2025 onward
bun --bun dev      # start dev server at localhost:4321
```

## How it works

On each page load, the latest 50 incidents are fetched from the [GitHub Status API](https://www.githubstatus.com/api) and upserted into a local SQLite database. The `scrape.ts` script backfills historical incidents by parsing the embedded data from `githubstatus.com/history` pages and fetching full details via the individual incident API.

The frontend renders a year-long heatmap where redder days indicate higher cumulative incident severity. Clicking a day shows its incidents. A trends section shows frequency/severity changes, impact breakdown, worst days, and a monthly bar chart.
