import type { ScratchpadItem } from "./types";

export class Scratchpad {
  private items: ScratchpadItem[] = [];
  private nextId = 1;

  /**
   * Initialize from a task plan or acceptance criteria.
   */
  init(steps: string[]): void {
    this.items = steps.map((desc) => ({
      id: String(this.nextId++),
      description: desc,
      status: "pending",
    }));
  }

  /**
   * Mark a step as in progress.
   */
  start(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) item.status = "in_progress";
  }

  /**
   * Mark a step as done.
   */
  complete(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) item.status = "done";
  }

  /**
   * Mark a step as blocked.
   */
  block(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) item.status = "blocked";
  }

  /**
   * Add a new step discovered during execution.
   */
  add(description: string): string {
    const id = String(this.nextId++);
    this.items.push({ id, description, status: "pending" });
    return id;
  }

  /**
   * Get current state for context injection.
   */
  getItems(): ScratchpadItem[] {
    return [...this.items];
  }

  /**
   * Render as text for the LLM context.
   */
  render(): string {
    if (this.items.length === 0) return "";

    return this.items
      .map((s) => {
        const marker =
          s.status === "done" ? "x"
          : s.status === "in_progress" ? ">"
          : s.status === "blocked" ? "!"
          : " ";
        return `[${marker}] ${s.description}`;
      })
      .join("\n");
  }

  /**
   * Check if all steps are done.
   */
  isComplete(): boolean {
    return this.items.length > 0 && this.items.every((i) => i.status === "done");
  }
}
