import { readFile, writeFile } from "node:fs/promises";

const manifestPath = "apps/web/scripts/media/photo-manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const titles = [...new Set(manifest.map((item) => item.sourceTitle))];
const params = new URLSearchParams({
  action: "query",
  titles: titles.join("|"),
  prop: "imageinfo",
  iiprop: "url|size|extmetadata",
  format: "json",
});
let response;
for (let attempt = 0; attempt < 5; attempt += 1) {
  response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": "WallHazeLicenseAudit/1.0" },
  });
  if (response.ok) break;
  await new Promise((resolve) => setTimeout(resolve, 3000 + attempt * 2000));
}
if (!response?.ok) throw new Error(`Commons API failed: ${response?.status}`);
const json = await response.json();
const byTitle = new Map();
for (const page of Object.values(json.query?.pages ?? {})) {
  const info = page.imageinfo?.[0];
  if (!info) continue;
  const meta = info.extmetadata ?? {};
  byTitle.set(page.title, {
    license: meta.LicenseShortName?.value ?? null,
    licenseUrl: meta.LicenseUrl?.value ?? null,
    artist: (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim(),
    copyrighted: meta.Copyrighted?.value ?? null,
    attributionRequired: meta.AttributionRequired?.value ?? null,
    descriptionUrl: info.descriptionurl ?? null,
  });
}
const audit = manifest.map((item) => {
  const found = byTitle.get(item.sourceTitle);
  return {
    key: item.key,
    sourceTitle: item.sourceTitle,
    output: item.output,
    declaredLicense: item.license,
    liveLicense: found?.license ?? null,
    liveLicenseUrl: found?.licenseUrl ?? null,
    liveAuthor: found?.artist ?? null,
    copyrighted: found?.copyrighted ?? null,
    attributionRequired: found?.attributionRequired ?? null,
    licenseVerified: found?.license === "CC0",
    sourcePage: item.sourcePage,
    checkedAt: new Date().toISOString(),
  };
});
const failed = audit.filter((item) => !item.licenseVerified);
await writeFile(
  "apps/web/scripts/media/license-audit.json",
  `${JSON.stringify(audit, null, 2)}\n`
);
console.log(`audited ${audit.length} outputs from ${titles.length} sources; failures=${failed.length}`);
for (const item of failed) console.log("FAIL", item.key, item.sourceTitle, item.liveLicense);
