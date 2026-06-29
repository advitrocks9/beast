import { ToolRegistry } from "../tools";
import { createCompanyKbTool } from "./company-kb";
import { createWebSearchTool } from "./web-search";
import { createCompetitorScanTool } from "./competitor-scan";

/**
 * Create a ToolRegistry pre-loaded with tools for a specific employee role.
 * All roles get company-kb. Marketing/sales get web search + competitor scan.
 */
export function createToolsForRole(
  roleType: "marketing" | "sales" | "support",
  tenantId: string,
): ToolRegistry {
  const registry = new ToolRegistry();

  // All roles can search the company knowledge base
  registry.register(createCompanyKbTool(tenantId));

  // Marketing and sales get research tools
  if (roleType === "marketing" || roleType === "sales") {
    registry.register(createWebSearchTool());
    registry.register(createCompetitorScanTool());
  }

  return registry;
}
