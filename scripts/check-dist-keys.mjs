// Run after `npm run build` (npm run check:dist). Lists every Supabase-style key in dist/
// and fails unless the only ones present are the public anon / publishable key.
// Legacy keys are JWTs, so the word "service_role" is base64-encoded inside them and a
// plain text search would miss it: decode each JWT and read its `role` instead.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const JWT = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
// New-format keys are a prefix plus a long random string. The Supabase library itself contains
// the bare prefixes (it uses startsWith to refuse secret keys in browsers), so require the key body.
const PUBLISHABLE = /sb_publishable_[A-Za-z0-9_-]{16,}/g;
const SECRET = /sb_secret_[A-Za-z0-9_-]{16,}/;

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else yield full;
  }
}

export function scanDist(dir) {
  const found = { jwts: [], publishable: [], secrets: [], problems: [] };
  for (const file of files(dir)) {
    const text = fs.readFileSync(file, "latin1");
    for (const jwt of text.match(JWT) ?? []) {
      let role = "unreadable";
      try { role = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")).role ?? "none"; } catch {}
      found.jwts.push({ file, role, jwt });
      if (role !== "anon") found.problems.push(`${file}: JWT key with role "${role}" (only "anon" is allowed)`);
    }
    for (const key of text.match(PUBLISHABLE) ?? []) found.publishable.push({ file, key });
    if (SECRET.test(text)) found.problems.push(`${file}: contains an sb_secret_ key`);
  }
  if (!found.jwts.length && !found.publishable.length) found.problems.push("No anon or publishable key found. Were VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set for this build?");
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = process.argv[2] ?? fileURLToPath(new URL("../dist", import.meta.url));
  const result = scanDist(dist);
  for (const { file, role, jwt } of result.jwts) console.log(`JWT key  role=${role}  ${jwt.slice(0, 24)}…  (${path.relative(process.cwd(), file)})`);
  for (const { file, key } of result.publishable) console.log(`publishable key  ${key.slice(0, 24)}…  (${path.relative(process.cwd(), file)})`);
  if (result.problems.length) { for (const problem of result.problems) console.error(`FAIL: ${problem}`); process.exit(1); }
  console.log("OK: only public anon / publishable keys are in dist/. Check the lines above are your project's keys.");
}
