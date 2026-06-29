import type { AgentEvent, AgentEventHandler } from "./types";

export class AgentEventEmitter {
  private handlers: AgentEventHandler[] = [];

  on(handler: AgentEventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  emit(event: AgentEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Don't let a handler error kill the agent loop
      }
    }
  }
}
