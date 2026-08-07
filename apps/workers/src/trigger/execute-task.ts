import { task, tasks as triggerTasks } from "@trigger.dev/sdk";
import { executeTaskRun } from "@beast/ai";
import type { ReviewNotifyPayload, SpawnPayload } from "@beast/ai";

async function triggerExecuteTask(payload: SpawnPayload): Promise<{ id: string }> {
  const handle = await triggerTasks.trigger("execute-task", payload);
  return { id: handle.id };
}

export const executeTaskJob = task({
  id: "execute-task",
  run: async (payload: SpawnPayload) =>
    executeTaskRun(payload.task.taskId, {
      spawn: triggerExecuteTask,
      notify: (p: ReviewNotifyPayload) => triggerTasks.trigger("slack-notify", p),
    }),
});
