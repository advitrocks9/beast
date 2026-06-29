// Canonical first-task starter prompts shown on the dashboard empty
// state. Source-of-truth for both the renderer and the tRPC mutation
// that creates the task.

export type StarterRole = "marketing" | "sales" | "support";

export interface OnboardingStarter {
  id: string;
  role: StarterRole;
  title: string;
  brief: string;
  etaMinutes: [number, number];
  taskType: string;
}

export const ONBOARDING_STARTERS: OnboardingStarter[] = [
  {
    id: "marketing_competitor_teardown",
    role: "marketing",
    title: "Teardown of one competitor",
    brief:
      "Pick a competitor and produce a one-page teardown: their pricing, positioning, three things they do better than us, three things we should not copy. End with one tactical move we can ship this month.",
    etaMinutes: [4, 6],
    taskType: "competitor_teardown",
  },
  {
    id: "marketing_three_linkedin_posts",
    role: "marketing",
    title: "Three LinkedIn posts in your voice",
    brief:
      "Draft three LinkedIn posts (250-350 words each) in the founder's voice based on the brand voice notes captured during onboarding. One thought leadership, one customer story, one contrarian take. Mark which one you would post first.",
    etaMinutes: [3, 5],
    taskType: "social_linkedin_batch",
  },
  {
    id: "marketing_cold_copy_teardown",
    role: "marketing",
    title: "Cold-email teardown of our own copy",
    brief:
      "Read the cold email or homepage hero in our knowledge base. Identify three sentences that bury the lede, suggest a rewrite of each, and tell us which one matters most.",
    etaMinutes: [3, 3],
    taskType: "copy_audit",
  },

  {
    id: "sales_25_in_icp",
    role: "sales",
    title: "List 25 in-ICP companies you can email this week",
    brief:
      "Use Serper plus the ICP captured during onboarding. List 25 companies that match the ICP, with one named contact each, plus a one-line reason this contact is reachable now (recent funding, hiring trigger, public post).",
    etaMinutes: [5, 7],
    taskType: "icp_company_list",
  },
  {
    id: "sales_cold_sequence_3",
    role: "sales",
    title: "Cold email sequence of 3, in your voice",
    brief:
      "Draft a 3-step cold sequence: initial, follow-up, breakup. Pick one named persona from the ICP. End with the subject lines for each step.",
    etaMinutes: [4, 4],
    taskType: "cold_email_sequence",
  },
  {
    id: "sales_reply_rewrite_weakest",
    role: "sales",
    title: "Reply rewrite for our weakest current cold email",
    brief:
      "If we have any past cold emails in knowledge, identify the one with the lowest reply rate or the most generic copy. Rewrite the first 2 sentences. Explain in one line why the rewrite will land.",
    etaMinutes: [3, 3],
    taskType: "cold_email_audit",
  },

  {
    id: "support_five_faqs",
    role: "support",
    title: "Five FAQ entries from existing tickets or KB",
    brief:
      "Look at the support knowledge captured at onboarding. Draft five FAQ entries (question plus a 2-3 sentence answer) that would deflect the most common ticket categories. Format ready to paste into a help center.",
    etaMinutes: [3, 5],
    taskType: "faq_batch",
  },
  {
    id: "support_three_reply_templates",
    role: "support",
    title: "Reply template for the three most common questions",
    brief:
      "From the support voice and KB, draft three reply templates (warm, calm, specific). Each one names the next step the customer should take.",
    etaMinutes: [3, 3],
    taskType: "support_reply_templates",
  },
  {
    id: "support_voice_audit",
    role: "support",
    title: "Audit one existing support reply for brand voice",
    brief:
      "If we have any past support replies, pick one and audit it for tone (overly formal, hedgy, defensive). Rewrite the first paragraph. Justify the rewrite in one line.",
    etaMinutes: [2, 3],
    taskType: "support_voice_audit",
  },
];

export function startersForRole(role: StarterRole): OnboardingStarter[] {
  return ONBOARDING_STARTERS.filter((s) => s.role === role);
}

export function starterById(id: string): OnboardingStarter | undefined {
  return ONBOARDING_STARTERS.find((s) => s.id === id);
}

export function formatEta(starter: OnboardingStarter): string {
  const [lo, hi] = starter.etaMinutes;
  return lo === hi ? `${lo} min` : `${lo}-${hi} min`;
}
