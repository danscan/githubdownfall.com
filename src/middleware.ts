import { defineMiddleware } from "astro:middleware";
import db from "./db";

const insert = db.prepare(`
  INSERT INTO visits (path, referrer, region) VALUES (?, ?, ?)
`);

export const onRequest = defineMiddleware(({ request }, next) => {
  const url = new URL(request.url);

  // Skip static assets
  if (url.pathname.startsWith("/_") || url.pathname.includes(".")) {
    return next();
  }

  const referrer = request.headers.get("referer") || "";
  const region = request.headers.get("fly-region") || "unknown";

  insert.run(url.pathname, referrer, region);

  return next();
});
