import fs from "node:fs";
import { createHash } from "node:crypto";
const version = createHash("sha256")
  .update(fs.readFileSync("dist/index.html"))
  .digest("hex")
  .slice(0, 12);
const sw = fs
  .readFileSync("dist/sw.js", "utf8")
  .replace("neoform-shell-v1", `neoform-shell-${version}`)
  .replace(
    "const CHUNKS = [];",
    `const CHUNKS = ${JSON.stringify(
      fs
        .readdirSync("dist/assets")
        .filter((name) => /\.(?:js|css|ttf)$/.test(name))
        .sort()
        .map((name) => "/assets/" + name),
    )};`,
  );
fs.writeFileSync("dist/sw.js", sw);
