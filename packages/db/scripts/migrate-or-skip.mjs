/**
 * CI/CD migration wrapper. Fails loudly on every unhealthy path; a deploy must
 * never ship code against a schema the migration never reached.
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

// Supabase's direct DB hostname publishes only AAAA records; GitHub-hosted
// runners have no IPv6 outbound. Resolve first so the failure names the fix.
let resolvedHost = parsedUrl.hostname;
try {
  const { address } = await lookup(parsedUrl.hostname, { family: 4 });
  resolvedHost = address;
} catch {
  console.error("==============================================================");
  console.error(`[migrate] ${parsedUrl.hostname} has no IPv4 record; this`);
  console.error("runner cannot reach it. Swap DATABASE_URL to the Supabase");
  console.error("pooler host (aws-0-<region>.pooler.supabase.com), which");
  console.error("publishes A records and accepts IPv4 from CI.");
  console.error("==============================================================");
  process.exit(1);
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

  if (hasCompanies && journalRows === 0) {
    console.error("==============================================================");
    console.error("[migrate] Schema drift: tables exist but the migration");
    console.error("journal is empty (schema applied via drizzle-kit push?).");
    console.error("Backfill drizzle.__drizzle_migrations to match the live");
    console.error("schema, or reset the database and re-run db:migrate.");
    console.error("==============================================================");
    process.exit(1);
  }

  await sql.end();

  const result = spawnSync("pnpm", ["--filter", "@beast/db", "db:migrate"], {
    stdio: "inherit",
    shell: false,
  });
  exitCode = result.status ?? 1;
} catch (err) {
  console.error("[migrate] preflight failed:", err?.message ?? err);
  exitCode = 1;
} finally {
  try {
    await sql.end();
  } catch {
    // already closed
  }
}

process.exit(exitCode);
