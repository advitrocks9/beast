// TS mirror of the identity-program tokens in app/globals.css so chips and dots
// never drift from CSS. Chips are squared ink blocks; fg always passes AA on bg.

export const INK = "#131311";
export const MUTED = "#6E6D68";
export const IDENTITY = "#E8420C";
export const IDENTITY_DEEP = "#BC3105";

export type RoleType = "marketing" | "sales" | "support";

type RoleMeta = { solid: string; tint: string; text: string };

const ROLE_META: Record<RoleType, RoleMeta> = {
  marketing: { solid: "#2E5FD0", tint: "#EBF0FA", text: "#244BA6" },
  sales: { solid: "#8A3D63", tint: "#F4ECF1", text: "#753253" },
  support: { solid: "#A07A00", tint: "#F6F1E3", text: "#7D5F00" },
};

const ROLE_FALLBACK: RoleMeta = { solid: MUTED, tint: "#F4F4F2", text: MUTED };

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

// dot = bright value, bg/fg = chip surface and AA text. `mode` picks the chip
// rendering: solid ink block, outline, or struck (cancelled).
export type StatusMeta = {
  label: string;
  dot: string;
  bg: string;
  fg: string;
  mode: "solid" | "outline" | "struck";
};

const GREEN = { dot: "#1E7A34", bg: "#1E7A34", fg: "#FFFFFF" };
const GREEN_OUT = { dot: "#1E7A34", bg: "transparent", fg: "#1E7A34" };
const IDENT = { dot: IDENTITY, bg: IDENTITY_DEEP, fg: "#FFFFFF" };
const IDENT_OUT = { dot: IDENTITY, bg: "transparent", fg: IDENTITY_DEEP };
const INK_SOLID = { dot: INK, bg: INK, fg: "#FFFFFF" };
const INK_OUT = { dot: INK, bg: "transparent", fg: INK };
const RED = { dot: "#C92A1B", bg: "#C92A1B", fg: "#FFFFFF" };
const GRAY_OUT = { dot: MUTED, bg: "transparent", fg: MUTED };

const STATUS_META: Record<string, StatusMeta> = {
  queued: { label: "Queued", mode: "outline", ...GRAY_OUT },
  planning: { label: "Planning", mode: "outline", ...GRAY_OUT },
  plan_review: { label: "Plan review", mode: "outline", ...INK_OUT },
  running: { label: "Running", mode: "solid", ...IDENT },
  in_review: { label: "In review", mode: "solid", ...INK_SOLID },
  revising: { label: "Revising", mode: "outline", ...IDENT_OUT },
  accepted: { label: "Accepted", mode: "solid", ...GREEN },
  revised: { label: "Revised", mode: "outline", ...IDENT_OUT },
  rejected: { label: "Rejected", mode: "solid", ...RED },
  auto_publishing: { label: "Publishing", mode: "outline", ...GREEN_OUT },
  published: { label: "Published", mode: "outline", ...GREEN_OUT },
  failed: { label: "Failed", mode: "solid", ...RED },
  timed_out: { label: "Timed out", mode: "solid", ...RED },
  cancelled: { label: "Cancelled", mode: "struck", ...GRAY_OUT },
  // employee badges
  idle: { label: "Idle", mode: "outline", ...GRAY_OUT },
  working: { label: "Working", mode: "solid", ...IDENT },
  waiting_review: { label: "Needs review", mode: "solid", ...INK_SOLID },
  check_in: { label: "Check-in", mode: "outline", ...INK_OUT },
};

const STATUS_FALLBACK: StatusMeta = { label: "Unknown", mode: "outline", ...GRAY_OUT };

export function statusMeta(status?: string | null): StatusMeta {
  if (status && status in STATUS_META) return STATUS_META[status]!;
  return STATUS_FALLBACK;
}

// Transitional aliases for surfaces not yet rebuilt; remove with last usage.
export const BRAND = IDENTITY;
export const BRAND_DEEP = IDENTITY_DEEP;
export const BRAND_LIGHT = "#FBEDE6";
