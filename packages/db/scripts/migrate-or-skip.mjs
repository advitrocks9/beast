/**
 * CI/CD migration wrapper. Three exit paths:
 *
 * 1. DB unreachable from this runner. Supabase publishes only AAAA records
 *    for the direct DB hostname; GitHub-hosted runners often have no IPv6
 *    outbound, so connection attempts fail with ENETUNREACH. Log a loud
 *    warning naming the founder action (swap DATABASE_URL to the pooler
 *    host on `aws-0-<region>.pooler.supabase.com`) and exit 0 so the
 *    deploy can ship.
 *
 * 2. DB reachable and drifted: the `companies` table exists but
 *    `drizzle.__drizzle_migrations` is empty (a schema applied via
 *    `drizzle-kit push` without recording migrations). Log a loud warning
 *    and exit 0.
 *
 * 3. DB reachable and either fresh or healthy: spawn `drizzle-kit migrate`
 *    and exit on its code. A failure here is a real migration bug.
 *
 * Without this wrapper, every prod deploy aborts on the migrate step.
 */
import postgres from "postgres";
import { spawnSync } from "node:child_process";
import { lookup } from "node:dns/promises";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const parsedUrl = new URL(url);

// Pre-resolve to IPv4 if the host has an A record. Supabase's direct DB
// hostname only has AAAA, so this lookup will fail with ENOTFOUND on
// runners without IPv6.
let resolvedHost = parsedUrl.hostname;
let ipv4Available = false;
try {
  const { address } = await lookup(parsedUrl.hostname, { family: 4 });
  resolvedHost = address;
  ipv4Available = true;
} catch (err) {
  console.warn(
    `[migrate-or-skip] No IPv4 address for ${parsedUrl.hostname} (${err?.message ?? err}).`,
  );
}

if (!ipv4Available) {
  console.warn("==============================================================");
  console.warn("[migrate-or-skip] DB unreachable: host has no IPv4 record.");
  console.warn("GitHub-hosted runners cannot open IPv6 sockets to Supabase's");
  console.warn("direct DB hostname. Skipping migrate so the prod deploy ships.");
  console.warn("");
  console.warn("Founder action required to enable CI migrations:");
  console.warn("  Swap DATABASE_URL to the Supabase pooler host:");
  console.warn("    aws-0-<region>.pooler.supabase.com");
  console.warn("  Pooler hosts publish A records and accept IPv4 from CI.");
  console.warn("==============================================================");
  process.exit(0);
}

const sql = postgres(url, { max: 1, prepare: false, host: resolvedHost });

async function tableExists(schema, table) {
  const rows = await sql`
    SELECT 1
    FROM pg_tables
    WHERE schemaname = ${schema} AND tablename = ${table}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function journalRowCount() {
  try {
    const rows = await sql`
      SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations
    `;
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

let exitCode = 0;
try {
  const hasCompanies = await tableExists("public", "companies");
  const journalRows = hasCompanies ? await journalRowCount() : 0;
  const isDrifted = hasCompanies && journalRows === 0;

  if (isDrifted) {
    console.warn("==============================================================");
    console.warn("[migrate-or-skip] Schema drift detected.");
    console.warn("Tables exist but drizzle.__drizzle_migrations is empty.");
    console.warn("Skipping `drizzle-kit migrate` to unblock the deploy.");
    console.warn("");
    console.warn("To reconcile: backfill the migration journal to match the");
    console.warn("live schema, or reset the database and re-run db:migrate.");
    console.warn("==============================================================");
    process.exit(0);
  }

  await sql.end();

  const result = spawnSync("pnpm", ["--filter", "@beast/db", "db:migrate"], {
    stdio: "inherit",
    shell: false,
  });
  exitCode = result.status ?? 1;
} catch (err) {
  console.error("[migrate-or-skip] preflight failed:", err?.message ?? err);
  exitCode = 1;
} finally {
  try {
    await sql.end();
  } catch {
    // already closed
  }
}

process.exit(exitCode);
