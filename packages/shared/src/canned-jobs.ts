export interface CannedJob {
  id: string;
  title: string;
  role: "marketing" | "sales" | "support";
  /** Matches the seed task vocabulary so a rate-limited commission can offer
   * a replay of a seeded terminal task of the same type. */
  taskType: string;
  brief: string;
  estSeconds: number;
  estTokens: number;
}

export const CANNED_JOBS: CannedJob[] = [
  {
    id: "teardown-trade",
    title: "Teardown: Trade Coffee subscription",
    role: "marketing",
    taskType: "report",
    brief:
      "Break down Trade Coffee's subscription offer: tiers, pricing with shipping, trial mechanics, and where Northwind wins or loses. Cite sources for every claim.",
    estSeconds: 75,
    estTokens: 9000,
  },
  {
    id: "newsletter-november",
    title: "Draft the November subscriber newsletter",
    role: "marketing",
    taskType: "email",
    brief:
      "Two featured single-origins with tasting notes, one brewing tip, and a soft mention of the new wholesale line. Northwind voice, under 400 words.",
    estSeconds: 60,
    estTokens: 7000,
  },
  {
    id: "outreach-goodcoffee",
    title: "Wholesale outreach: Good Coffee PDX",
    role: "sales",
    taskType: "email",
    brief:
      "First-touch email to Good Coffee's buyer about the new wholesale line. Short, specific to their shops, no discounts in the first message.",
    estSeconds: 55,
    estTokens: 5000,
  },
  {
    id: "support-grinder",
    title: "Reply: 'my grinder setting stopped working'",
    role: "support",
    taskType: "custom",
    brief:
      "A Regular-tier subscriber says their usual grind setting suddenly tastes sour. Explain the likely cause (new harvest, denser beans), give a concrete adjustment, keep Maya's voice.",
    estSeconds: 45,
    estTokens: 4000,
  },
];

export function cannedJob(id: string): CannedJob | undefined {
  return CANNED_JOBS.find((j) => j.id === id);
}
