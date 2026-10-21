import type { CheckStatus } from "@/lib/constants";

export type ConditionCheckEntry = { key: string; status: CheckStatus; note?: string };

/**
 * Functional score (0-100) derived from the checklist so buyers can compare
 * items objectively: PASS = full credit, MINOR = half, FAIL = none, NA ignored.
 */
export function functionalScore(checks: readonly ConditionCheckEntry[]): number {
  const applicable = checks.filter((c) => c.status !== "NA");
  if (applicable.length === 0) return 100;
  const points = applicable.reduce((sum, c) => sum + (c.status === "PASS" ? 1 : c.status === "MINOR" ? 0.5 : 0), 0);
  return Math.round((points / applicable.length) * 100);
}

export function batteryLabel(health: number | null | undefined): { label: string; tone: string } | null {
  if (health === null || health === undefined) return null;
  if (health >= 90) return { label: "Excellent", tone: "text-emerald-700" };
  if (health >= 80) return { label: "Good", tone: "text-teal-700" };
  if (health >= 70) return { label: "Fair", tone: "text-amber-700" };
  return { label: "Service recommended", tone: "text-rose-700" };
}

export function countIssues(checks: readonly ConditionCheckEntry[]) {
  return {
    minor: checks.filter((c) => c.status === "MINOR").length,
    failed: checks.filter((c) => c.status === "FAIL").length,
  };
}
