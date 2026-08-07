import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@beast/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.execute(sql`SELECT count(*)::int AS companies FROM companies`);
    const companies = Number((rows as Array<{ companies: number }>)[0]?.companies ?? 0);
    return NextResponse.json({ ok: true, companies });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "db unreachable" },
      { status: 503 },
    );
  }
}
