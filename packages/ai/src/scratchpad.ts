import type { ScratchpadItem } from "./types";

export class Scratchpad {
  private items: ScratchpadItem[] = [];
  private nextId = 1;

  init(steps: string[]): void {
    this.items = steps.map((desc) => ({
      id: String(this.nextId++),
      description: desc,
      status: "pending",
    }));
  }

  start(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) item.status = "in_progress";
  }

  complete(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) item.status = "done";
  }

  block(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) item.status = "blocked";
  }

  getItems(): ScratchpadItem[] {
    return [...this.items];
  }

  render(): string {
    if (this.items.length === 0) return "";

    return this.items
      .map((s) => {
        const marker =
          s.status === "done" ? "x"
          : s.status === "in_progress" ? ">"
          : s.status === "blocked" ? "!"
          : " ";
        return `[${marker}] #${s.id} ${s.description}`;
      })
      .join("\n");
  }
}
