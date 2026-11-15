// Targeted Cloudflare cache purge for one image URL (seaside white-strip fix).
// Uses wrangler's stored OAuth token — never printed or persisted.
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const cfgPath = path.join(
  os.homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml"
);
const cfg = readFileSync(cfgPath, "utf8");
const tokenMatch = cfg.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!tokenMatch) { console.error("no oauth token found"); process.exit(1); }
const token = tokenMatch[1];

const ZONE_NAME = "wallhaze.com";
const FILES = ["https://wallhaze.com/images/wallpapers/seaside-daydream-boy.jpg"];

const headers = {
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/json",
};

// 1. Find the zone id
const zr = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}`, { headers });
const zj = await zr.json();
if (!zj.success || !zj.result?.length) { console.error("zone lookup failed:", JSON.stringify(zj.errors ?? zj).slice(0, 300)); process.exit(1); }
const zoneId = zj.result[0].id;
console.log("zone:", zj.result[0].name, zoneId);

// 2. Purge by URL
const pr = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
  method: "POST",
  headers,
  body: JSON.stringify({ files: FILES }),
});
const pj = await pr.json();
console.log("purge:", JSON.stringify({ success: pj.success, errors: pj.errors }, null, 1));
