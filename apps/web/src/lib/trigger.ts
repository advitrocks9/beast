import { tasks } from "@trigger.dev/sdk";

/**
 * Trigger a background task via Trigger.dev.
 * Used from tRPC routes to dispatch work to the workers app.
 */
export async function triggerTask<T>(
  taskId: string,
  payload: T,
): Promise<{ id: string }> {
  const handle = await tasks.trigger(taskId, payload);
  return { id: handle.id };
}

/**
 * Trigger a task and wait for the result.
 * Use sparingly - blocks the request until the task completes.
 */
export async function triggerAndWait<TPayload, TResult>(
  taskId: string,
  payload: TPayload,
): Promise<TResult> {
  const handle = await tasks.triggerAndWait(taskId, payload);
  if (!handle.ok) {
    throw new Error(`Task ${taskId} failed`);
  }
  return handle.output as TResult;
}
