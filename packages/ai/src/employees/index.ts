export { marketingSkills, writeBlogPost, createSocialPost, draftNewsletter } from "./marketing";
export { salesSkills, draftOutreachEmail, createEmailSequence } from "./sales";
export { supportSkills, draftTicketResponse, writeFaqArticle } from "./support";
export { PERSONAS, getPersona, getEmployeeName, getRoleTitle } from "./personas";

import { marketingSkills } from "./marketing";
import { salesSkills } from "./sales";
import { supportSkills } from "./support";
import type { Skill } from "../skills/types";

const skillRegistry = new Map<string, Skill>();

for (const skill of [...marketingSkills, ...salesSkills, ...supportSkills]) {
  skillRegistry.set(skill.id, skill);
}

export function getSkill(id: string): Skill | undefined {
  return skillRegistry.get(id);
}

export function getSkillsForRole(roleType: "marketing" | "sales" | "support"): Skill[] {
  return [...skillRegistry.values()].filter((s) => s.employeeType === roleType);
}
