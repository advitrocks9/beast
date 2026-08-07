import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { aiEmployees, companies, db, proceduralMemories } from "@beast/db";
import { diffWords } from "./diff";
import { accumulateSignal, confidenceFrom } from "./extraction";

describe("diffWords", () => {
  it("yields exact kept/removed/added spans and token-level magnitude for a substitution", () => {
    const result = diffWords("keep the tone warm and human", "keep the tone crisp and human");
    expect(result.spans).toEqual([
      { type: "kept", text: "keep the tone" },
      { type: "removed", text: "warm" },
      { type: "added", text: "crisp" },
      { type: "kept", text: "and human" },
    ]);
    expect(result.magnitude).toBeCloseTo(1 / 6, 10);
  });

  it("scores a pure word reorder as a real change", () => {
    // a char-histogram diff sees identical characters and reports zero change
    const result = diffWords("alpha beta", "beta alpha");
    expect(result.magnitude).toBeCloseTo(0.5, 10);
  });
});

describe("confidenceFrom", () => {
  it("maps weight 1.6 to 0.5507 via 1 - exp(-w/2)", () => {
    expect(confidenceFrom(1.6)).toBeCloseTo(0.5507, 3);
  });

  it("is strictly increasing and bounded in (0, 1)", () => {
    const values = [0.1, 0.5, 1, 1.6, 2, 4, 8].map(confidenceFrom);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!);
    }
    expect(values[0]).toBeGreaterThan(0);
    expect(values.at(-1)).toBeLessThan(1);
  });
});

async function dbReachable(): Promise<boolean> {
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("db probe timed out")), 3000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

const dbUp = await dbReachable();
if (!dbUp) {
  console.warn(
    `[memory.test] postgres unreachable at ${process.env.DATABASE_URL}; skipping promotion-gate pins. ` +
      "Start it with: docker compose up -d && pnpm --filter @beast/db db:migrate",
  );
}

afterAll(async () => {
  await db.$client.end({ timeout: 5 }).catch(() => {});
});

describe.skipIf(!dbUp)("promotion gate (docker db)", () => {
  let tenantId: string;
  let agentId: string;

  beforeAll(async () => {
    const [company] = await db
      .insert(companies)
      .values({ userId: crypto.randomUUID(), name: "memory-test tenant" })
      .returning({ id: companies.id });
    tenantId = company!.id;
    const [agent] = await db
      .insert(aiEmployees)
      .values({
        companyId: tenantId,
        name: "memory-test agent",
        roleTitle: "Support Lead",
        roleType: "support",
        personality: {},
        systemPrompt: "test agent",
      })
      .returning({ id: aiEmployees.id });
    agentId = agent!.id;
  });

  afterAll(async () => {
    if (tenantId) await db.delete(companies).where(eq(companies.id, tenantId));
  });

  it("never promotes off a single review, whatever its weight", async () => {
    const signal = {
      agentId,
      tenantId,
      category: "tone" as const,
      ruleType: "style_rule",
      taskScope: ["email"],
      title: "one-review pin",
      description: "a single review must not become a standing rule",
      weight: 5.0,
      reviewId: crypto.randomUUID(),
    };
    const first = await accumulateSignal(signal);
    const resent = await accumulateSignal(signal);

    expect(first.promotedRuleId).toBeNull();
    expect(resent.promotedRuleId).toBeNull();
    expect(resent.confidence).toBeGreaterThan(0.6);
    expect(resent.distinctReviewCount).toBe(1);

    const rules = await db.query.proceduralMemories.findMany({
      where: eq(proceduralMemories.agentId, agentId),
    });
    expect(rules).toHaveLength(0);
  });

  it("promotes exactly one rule once three distinct reviews corroborate", async () => {
    const signal = () => ({
      agentId,
      tenantId,
      category: "tone" as const,
      ruleType: "style_rule",
      taskScope: ["email"],
      title: "corroboration pin",
      description: "three distinct reviews clear the tone threshold",
      weight: 1.0,
      reviewId: crypto.randomUUID(),
    });
    const first = await accumulateSignal(signal());
    const second = await accumulateSignal(signal());
    const third = await accumulateSignal(signal());

    expect(first.promotedRuleId).toBeNull();
    expect(second.promotedRuleId).toBeNull();
    expect(third.promotedRuleId).not.toBeNull();

    const rules = await db.query.proceduralMemories.findMany({
      where: and(eq(proceduralMemories.agentId, agentId), eq(proceduralMemories.title, "corroboration pin")),
    });
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe(third.promotedRuleId);
  });
});
