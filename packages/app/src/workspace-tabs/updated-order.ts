import type { RelativeTimeLabel } from "@/utils/time";

// Unlike the general relative-time formatter, tab badges keep elapsed days beyond a week.
export function describeAgentUpdateAge(date: Date, now: Date = new Date()): RelativeTimeLabel {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 60) return { label: `${minutes}m ago`, resolution: "minute" };
  if (minutes < 1440) return { label: `${Math.floor(minutes / 60)}h ago`, resolution: "hour" };
  return { label: `${Math.floor(minutes / 1440)}d ago`, resolution: "day" };
}
