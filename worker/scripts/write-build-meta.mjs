import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

function readGit(args, fallback = null) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const commit = process.env.WORKERS_CI_COMMIT_SHA || readGit(["rev-parse", "HEAD"]);
const branch = process.env.WORKERS_CI_BRANCH || readGit(["rev-parse", "--abbrev-ref", "HEAD"], "main");
const buildUuid = process.env.WORKERS_CI_BUILD_UUID || null;

await mkdir(new URL("../generated/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../generated/build-meta.js", import.meta.url),
  `export const BUILD_META = ${JSON.stringify({
    commit,
    branch,
    buildUuid,
    source: process.env.WORKERS_CI_COMMIT_SHA ? "workers-ci" : "git"
  }, null, 2)};\n`
);

console.log(`Build metadata: ${commit || "unknown"} (${branch || "unknown"})`);
