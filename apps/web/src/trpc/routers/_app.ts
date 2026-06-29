import { createTRPCRouter } from "../init";
import { companyRouter } from "./company";
import { knowledgeRouter } from "./knowledge";
import { departmentsRouter } from "./departments";
import { employeesRouter } from "./employees";
import { goalsRouter } from "./goals";
import { tasksRouter } from "./tasks";
import { deliverablesRouter } from "./deliverables";
import { annotationsRouter } from "./annotations";
import { checkInsRouter } from "./check-ins";
import { collaborationRouter } from "./collaboration";
import { chatRouter } from "./chat";
import { onboardingRouter } from "./onboarding";
import { connectorsRouter } from "./connectors";
import { reviewQueueRouter } from "./review-queue";
import { reviewsRouter } from "./reviews";
import { activityRouter } from "./activity";
import { notificationsRouter } from "./notifications";
import { billingRouter } from "./billing";
import { memoryRouter } from "./memory";
import { shareRouter } from "./share";
import { eventsRouter } from "./events";
import { autonomyRouter } from "./autonomy";
import { systemRouter } from "./system";

export const appRouter = createTRPCRouter({
  company: companyRouter,
  knowledge: knowledgeRouter,
  departments: departmentsRouter,
  employees: employeesRouter,
  goals: goalsRouter,
  tasks: tasksRouter,
  deliverables: deliverablesRouter,
  annotations: annotationsRouter,
  checkIns: checkInsRouter,
  collaboration: collaborationRouter,
  chat: chatRouter,
  onboarding: onboardingRouter,
  connectors: connectorsRouter,
  reviewQueue: reviewQueueRouter,
  reviews: reviewsRouter,
  activity: activityRouter,
  notifications: notificationsRouter,
  billing: billingRouter,
  memory: memoryRouter,
  share: shareRouter,
  events: eventsRouter,
  autonomy: autonomyRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
