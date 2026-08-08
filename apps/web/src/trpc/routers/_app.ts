import { createTRPCRouter } from "../init";
import { companyRouter } from "./company";
import { knowledgeRouter } from "./knowledge";
import { employeesRouter } from "./employees";
import { goalsRouter } from "./goals";
import { tasksRouter } from "./tasks";
import { deliverablesRouter } from "./deliverables";
import { checkInsRouter } from "./check-ins";
import { collaborationRouter } from "./collaboration";
import { chatRouter } from "./chat";
import { onboardingRouter } from "./onboarding";
import { connectorsRouter } from "./connectors";
import { reviewsRouter } from "./reviews";
import { notificationsRouter } from "./notifications";
import { billingRouter } from "./billing";
import { memoryRouter } from "./memory";
import { autonomyRouter } from "./autonomy";
import { systemRouter } from "./system";

export const appRouter = createTRPCRouter({
  company: companyRouter,
  knowledge: knowledgeRouter,
  employees: employeesRouter,
  goals: goalsRouter,
  tasks: tasksRouter,
  deliverables: deliverablesRouter,
  checkIns: checkInsRouter,
  collaboration: collaborationRouter,
  chat: chatRouter,
  onboarding: onboardingRouter,
  connectors: connectorsRouter,
  reviews: reviewsRouter,
  notifications: notificationsRouter,
  billing: billingRouter,
  memory: memoryRouter,
  autonomy: autonomyRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
