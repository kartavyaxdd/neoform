import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
await mkdir(".ai-runtime", { recursive: true });
await build({
  entryPoints: ["src/videos.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".ai-runtime/videos.mjs",
  logLevel: "silent",
});
const { demonstrations, watchUrl } = await import(
  pathToFileURL(path.resolve(".ai-runtime/videos.mjs")).href
);
const sources = [];
for (const [exerciseId, demo] of Object.entries(demonstrations)) {
  const url = watchUrl(demo.id),
    oembed =
      "https://www.youtube.com/oembed?format=json&url=" +
      encodeURIComponent(url);
  const res = await fetch(oembed);
  if (!res.ok)
    throw new Error("Metadata unavailable " + exerciseId + " " + res.status);
  const metadata = await res.json();
  if (metadata.author_name !== demo.creator)
    throw new Error("Creator mismatch " + exerciseId);
  if (metadata.title !== demo.title)
    throw new Error("Title mismatch " + exerciseId);
  const watch = await fetch(url),
    embed = await fetch("https://www.youtube-nocookie.com/embed/" + demo.id);
  if (!watch.ok || !embed.ok)
    throw new Error(
      `Video documents unavailable ${exerciseId}: watch=${watch.status}, embed=${embed.status}`,
    );
  sources.push({
    exerciseId,
    ...demo,
    verifiedTitle: metadata.title,
    url,
    creatorUrl: metadata.author_url,
    oembedStatus: res.status,
    watchStatus: watch.status,
    embedDocumentStatus: embed.status,
    verifiedAt: new Date().toISOString(),
    cues: "Original NEOFORM cues in src/domain.ts; no copied creator footage. Playback may be restricted; direct watch always offered.",
  });
}
await writeFile(
  "evidence/v2/video-source-manifest.json",
  JSON.stringify(sources, null, 2),
);
console.log(
  "Verified " +
    sources.length +
    " specific creator demonstrations using YouTube oEmbed; watch and embed documents reachable.",
);
