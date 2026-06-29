// Single source of truth for role and status color. Hexes mirror the CSS tokens
// in app/globals.css so TS and CSS never drift. Every semantic carries a bright
// value for dots/fills and a separate AA-passing text shade, so a tinted chip is
// never a saturated hue painted as text on its own tint.

export const BRAND = "#0F766E";
export const BRAND_DEEP = "#0B5C56";
export const BRAND_LIGHT = "#E6F2F0";
export const INK = "#1C1A17";
export const MUTED = "#6B7280";

// Roles are identity only: low chroma, never reused as a status signal.
export type RoleType = "marketing" | "sales" | "support";

type RoleMeta = { solid: string; tint: string; text: string };

const ROLE_META: Record<RoleType, RoleMeta> = {
  marketing: { solid: "#A85D44", tint: "#F1ECEA", text: "#9A4A2C" }, // muted clay, Alex
  sales: { solid: "#834A6A", tint: "#F0EAEF", text: "#7A3457" }, // muted plum, Jordan
  support: { solid: "#46618A", tint: "#E9EDF3", text: "#3C5478" }, // slate-blue, Sam
};

const ROLE_FALLBACK: RoleMeta = { solid: MUTED, tint: "#F1F2F4", text: MUTED };

// Solid hexes only, in the shape the app's inline maps used (drop-in replacement).
export const ROLE_COLORS: Record<string, string> = {
  marketing: ROLE_META.marketing.solid,
  sales: ROLE_META.sales.solid,
  support: ROLE_META.support.solid,
};

export function roleMeta(roleType?: string | null): RoleMeta {
  if (roleType && roleType in ROLE_META) return ROLE_META[roleType as RoleType];
  return ROLE_FALLBACK;
}

export function roleColor(roleType?: string | null): string {
  return roleMeta(roleType).solid;
}

// Status / signal. dot = the bright value, bg = a light tint for chips,
// fg = an AA-passing text shade for that tint or for white backgrounds.
export type StatusMeta = { label: string; dot: string; bg: string; fg: string };

const GREEN: Omit<StatusMeta, "label"> = { dot: "#22C55E", bg: "#ECFDF3", fg: "#15803D" };
const TEAL: Omit<StatusMeta, "label"> = { dot: BRAND, bg: BRAND_LIGHT, fg: BRAND_DEEP };
const AMBER: Omit<StatusMeta, "label"> = { dot: "#F59E0B", bg: "#FEF6E7", fg: "#8A5200" };
const RED: Omit<StatusMeta, "label"> = { dot: "#DC2626", bg: "#FEF2F2", fg: "#B91C1C" };
const GRAY: Omit<StatusMeta, "label"> = { dot: MUTED, bg: "#F3F1EA", fg: MUTED };

const STATUS_META: Record<string, StatusMeta> = {
  // in-flight / live = brand teal
  working: { label: "Working", ...TEAL },
  in_progress: { label: "In progress", ...TEAL },
  active: { label: "Active", ...TEAL },
  running: { label: "Running", ...TEAL },
  // needs a human = amber ("your turn")
  pending: { label: "Pending", ...AMBER },
  waiting_review: { label: "Needs review", ...AMBER },
  needs_review: { label: "Needs review", ...AMBER },
  review: { label: "In review", ...AMBER },
  revision: { label: "Revision", ...AMBER },
  blocked: { label: "Blocked", ...AMBER },
  // success / terminal-good = green; published stays on-brand teal-deep (live)
  approved: { label: "Approved", ...GREEN },
  completed: { label: "Completed", ...GREEN },
  done: { label: "Done", ...GREEN },
  published: { label: "Published", dot: BRAND_DEEP, bg: BRAND_LIGHT, fg: BRAND_DEEP },
  // failure = red
  rejected: { label: "Rejected", ...RED },
  failed: { label: "Failed", ...RED },
  error: { label: "Error", ...RED },
  // dormant = gray
  idle: { label: "Idle", ...GRAY },
  paused: { label: "Paused", ...GRAY },
  scheduled: { label: "Scheduled", ...GRAY },
  queued: { label: "Queued", ...GRAY },
  draft: { label: "Draft", ...GRAY },
};

const STATUS_FALLBACK: StatusMeta = { label: "Unknown", ...GRAY };

export function statusMeta(status?: string | null): StatusMeta {
  if (status && status in STATUS_META) return STATUS_META[status]!;
  return STATUS_FALLBACK;
}
