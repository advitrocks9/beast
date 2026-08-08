export { PERSONAS, getPersona, getEmployeeName, getRoleTitle } from "./personas";

export interface Skill {
  id: string;
  name: string;
  employeeType: "marketing" | "sales" | "support";
}

const SKILLS: Skill[] = [
  { id: "write-blog-post", name: "Write Blog Post", employeeType: "marketing" },
  { id: "create-social-post", name: "Create Social Post", employeeType: "marketing" },
  { id: "draft-newsletter", name: "Draft Newsletter", employeeType: "marketing" },
  { id: "draft-outreach-email", name: "Draft Outreach Email", employeeType: "sales" },
  { id: "create-email-sequence", name: "Create Email Sequence", employeeType: "sales" },
  { id: "draft-ticket-response", name: "Draft Ticket Response", employeeType: "support" },
  { id: "write-faq-article", name: "Write FAQ Article", employeeType: "support" },
];

export function getSkillsForRole(roleType: "marketing" | "sales" | "support"): Skill[] {
  return SKILLS.filter((s) => s.employeeType === roleType);
}
