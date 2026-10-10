import fs from "node:fs";
import { createHash } from "node:crypto";
const version = createHash("sha256")
  .update(fs.readFileSync("dist/index.html"))
  .digest("hex")
  .slice(0, 12);
const sw = fs
  .readFileSync("dist/sw.js", "utf8")
  .replace("neoform-shell-v1", `neoform-shell-${version}`);
fs.writeFileSync("dist/sw.js", sw);
