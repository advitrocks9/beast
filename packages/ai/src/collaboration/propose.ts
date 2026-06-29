import { db, aiEmployees, collaborationProposals, tasks, deliverables } from "@beast/db";
import { eq, and } from "drizzle-orm";
import { getClient, getModelId } from "../models";

interface CollaborationCheck {
  employeeId: string;
  companyId: string;
  deliverableId: string;
  deliverableTitle: string;
  deliverableType: string;
  taskType: string;
}

interface ProposalResult {
  created: boolean;
  proposalId?: string;
  toEmployeeName?: string;
}

/**
 * Check if a completed deliverable could benefit another employee.
 * Uses Haiku for fast classification, only creates a proposal if relevant.
 */
export async function checkForCollaboration(input: CollaborationCheck): Promise<ProposalResult> {
  // Load the completing employee
  const fromEmployee = await db.query.aiEmployees.findFirst({
    where: eq(aiEmployees.id, input.employeeId),
    columns: { id: true, name: true, roleType: true },
  });

  if (!fromEmployee) return { created: false };

  // Load other employees in the same company
  const otherEmployees = await db.query.aiEmployees.findMany({
    where: and(
      eq(aiEmployees.companyId, input.companyId),
    ),
    columns: { id: true, name: true, roleType: true, roleTitle: true },
  });

  const targets = otherEmployees.filter((e) => e.id !== input.employeeId);
  if (targets.length === 0) return { created: false };

  // Quick heuristic: known collaboration patterns
  const opportunity = findCollaborationOpportunity(
    fromEmployee.roleType,
    input.deliverableType,
    input.taskType,
    targets,
  );

  if (!opportunity) return { created: false };

  // Use Haiku to generate a specific proposal
  const client = getClient();
  const response = await client.messages.create({
    model: getModelId("haiku"),
    max_tokens: 200,
    system: "Generate a brief collaboration proposal between AI employees. Return only the proposal text, 1-2 sentences.",
    messages: [{
      role: "user",
      content: `${fromEmployee.name} (${fromEmployee.roleType}) just completed: "${input.deliverableTitle}" (${input.deliverableType}).

${opportunity.targetName} (${opportunity.targetRole}) could use this. Write a proposal for what ${opportunity.targetName} could do with it.`,
    }],
  });

  const proposalText = response.content[0]?.type === "text"
    ? response.content[0].text
    : `${fromEmployee.name}'s "${input.deliverableTitle}" could be useful for ${opportunity.targetName}'s work.`;

  // Create the proposal
  const [proposal] = await db.insert(collaborationProposals).values({
    companyId: input.companyId,
    fromEmployeeId: fromEmployee.id,
    toEmployeeId: opportunity.targetId,
    sourceDeliverableId: input.deliverableId,
    proposal: proposalText,
    status: "pending",
  }).returning({ id: collaborationProposals.id });

  return {
    created: true,
    proposalId: proposal?.id,
    toEmployeeName: opportunity.targetName,
  };
}

interface CollaborationTarget {
  targetId: string;
  targetName: string;
  targetRole: string;
}

/** Heuristic: known cross-department collaboration patterns. */
function findCollaborationOpportunity(
  fromRole: string,
  deliverableType: string,
  taskType: string,
  targets: Array<{ id: string; name: string; roleType: string; roleTitle: string }>,
): CollaborationTarget | null {
  // Marketing content → SDR can reference in outreach
  if (fromRole === "marketing" && (deliverableType === "blog" || deliverableType === "social_linkedin")) {
    const sdr = targets.find((t) => t.roleType === "sales");
    if (sdr) return { targetId: sdr.id, targetName: sdr.name, targetRole: sdr.roleTitle };
  }

  // SDR identifies objection → Support can update FAQ
  if (fromRole === "sales" && taskType === "research-prospect") {
    const support = targets.find((t) => t.roleType === "support");
    if (support) return { targetId: support.id, targetName: support.name, targetRole: support.roleTitle };
  }

  // Support writes FAQ → Marketing can create content around common questions
  if (fromRole === "support" && deliverableType === "faq") {
    const marketing = targets.find((t) => t.roleType === "marketing");
    if (marketing) return { targetId: marketing.id, targetName: marketing.name, targetRole: marketing.roleTitle };
  }

  return null;
}

// Compatible with both `db` and a drizzle transaction `tx`. Both expose the
// same query/insert/update surface; tx carries an extra `$client` we don't use.
type DbClient = Pick<typeof db, "query" | "insert" | "update">;

/**
 * Create a task for the target employee when a collaboration proposal is approved.
 * The caller passes a `client` (db or a transaction) so the task creation can
 * commit atomically with whatever else the caller is doing (e.g. the proposal
 * status flip + activity log write in collaboration.respond).
 */
export async function createCollaborationTask(
  client: DbClient,
  params: { proposalId: string; companyId: string },
): Promise<string | null> {
  const proposal = await client.query.collaborationProposals.findFirst({
    where: and(
      eq(collaborationProposals.id, params.proposalId),
      eq(collaborationProposals.companyId, params.companyId),
    ),
  });

  if (!proposal || proposal.status !== "approved") return null;

  let sourceContext = "";
  if (proposal.sourceDeliverableId) {
    const source = await client.query.deliverables.findFirst({
      where: eq(deliverables.id, proposal.sourceDeliverableId),
      columns: { title: true, renderedPreview: true },
    });
    if (source) {
      sourceContext = `\n\nReference deliverable: "${source.title}"\n${(source.renderedPreview ?? "").slice(0, 1000)}`;
    }
  }

  const [task] = await client.insert(tasks).values({
    companyId: params.companyId,
    aiEmployeeId: proposal.toEmployeeId,
    title: `Collaboration: ${proposal.proposal.slice(0, 80)}`,
    brief: {
      objective: proposal.proposal,
      _collaborationSource: proposal.fromEmployeeId,
      _sourceDeliverableId: proposal.sourceDeliverableId,
      _sourceContext: sourceContext,
    },
    taskType: "custom",
    origin: "collaboration",
    status: "pending",
  }).returning({ id: tasks.id });

  if (!task) return null;

  await client.update(collaborationProposals).set({
    resultingTaskId: task.id,
  }).where(eq(collaborationProposals.id, params.proposalId));

  return task.id;
}
