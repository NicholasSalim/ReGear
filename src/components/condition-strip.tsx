import type { Dictionary } from "@/i18n/server";
import type { CheckStatus } from "@/lib/constants";
import { cn } from "@/components/ui";

// The condition strip: one segment per inspected check, coloured by result.
// It is ReGear's visual signature, used on cards, the listing report and the logo.
const SEGMENT: Record<CheckStatus, string> = {
  PASS: "bg-pass",
  MINOR: "bg-minor",
  FAIL: "bg-fail",
  NA: "bg-na",
};

export function summarizeChecks(checks: readonly { status: CheckStatus }[]) {
  const count = (s: CheckStatus) => checks.filter((c) => c.status === s).length;
  return { pass: count("PASS"), minor: count("MINOR"), fail: count("FAIL"), na: count("NA"), total: checks.length };
}

/** "8 of 10 checks passed, 1 minor issue" in the page's language. */
export function stripLabel(checks: readonly { status: CheckStatus }[], t: Dictionary["condition"]) {
  const s = summarizeChecks(checks);
  const parts = [t.stripPassed(s.pass, s.total - s.na)];
  if (s.minor) parts.push(t.stripMinor(s.minor));
  if (s.fail) parts.push(t.stripFailed(s.fail));
  return parts.join(", ");
}

export function ConditionStrip({
  checks,
  label,
  size = "sm",
  animate,
  className,
}: {
  checks: readonly { key?: string; status: CheckStatus; label?: string }[];
  /** Accessible summary, usually stripLabel(checks, t.condition). */
  label: string;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  className?: string;
}) {
  if (!checks.length) return null;
  const height = size === "lg" ? "h-7" : size === "md" ? "h-3" : "h-1.5";
  const gap = size === "lg" ? "gap-1" : "gap-[3px]";
  return (
    <div role="img" aria-label={label} className={cn("flex w-full", gap, animate && "strip-animate", className)}>
      {checks.map((c, i) => (
        <span
          key={c.key ?? i}
          title={c.label}
          className={cn("flex-1 rounded-[2px]", height, SEGMENT[c.status])}
          style={animate ? { animationDelay: `${120 + i * 55}ms` } : undefined}
        />
      ))}
    </div>
  );
}

/** Wordmark glyph: a five-segment strip with one honest amber segment. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex h-5 items-end gap-[2px]", className)}>
      {["bg-pass h-5", "bg-pass h-5", "bg-pass h-5", "bg-minor h-5", "bg-pass h-5"].map((c, i) => (
        <span key={i} className={cn("w-[5px] rounded-[1.5px]", c)} />
      ))}
    </span>
  );
}
