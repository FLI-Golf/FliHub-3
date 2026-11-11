import { parseZonedDateTime } from "@internationalized/date";
export interface TeeSchedule {
  timeZone: string;
  intervalMinutes: number;
  slots: { group: string; startsAt: string }[];
}
export function toTeeInstant(local: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("Enter a date and time for every group.");
  try {
    return parseZonedDateTime(`${local}[${timeZone}]`, "reject")
      .toDate()
      .toISOString();
  } catch {
    throw new Error(
      "Check the timezone and tee time. Ambiguous or skipped daylight-saving times must be changed.",
    );
  }
}
export function teeLocal(startsAt: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(startsAt));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function teeDisplay(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(startsAt));
}
export function generateTeeTimes(
  first: string,
  interval: number,
  count: number,
  timeZone: string,
): string[] {
  if (!Number.isInteger(interval) || interval < 1 || interval > 240)
    throw new Error("Use an interval from 1 to 240 whole minutes.");
  const start = Date.parse(toTeeInstant(first, timeZone));
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * interval * 60000).toISOString(),
  );
}
