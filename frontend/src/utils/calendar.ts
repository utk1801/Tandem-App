import type { CalendarEntry, EventItem, ProfileDates, Recurrence } from "@/src/types/calendar";

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function yearsBetween(a: Date, b: Date): number {
  return b.getFullYear() - a.getFullYear();
}

export function matchesRecurrence(start: Date, target: Date, rec: Recurrence): boolean {
  const interval = rec.interval || 1;
  if (rec.end_date && target > parseYmd(rec.end_date)) return false;

  const diffDays = Math.round((target.getTime() - start.getTime()) / 86400000);

  switch (rec.type) {
    case "daily":
      return diffDays >= 0 && diffDays % interval === 0;
    case "weekly": {
      if (!rec.weekdays?.length) {
        const weeks = Math.floor(diffDays / 7);
        return diffDays >= 0 && weeks % interval === 0 && target.getDay() === start.getDay();
      }
      if (!rec.weekdays.includes(target.getDay())) return false;
      const weekNum = Math.floor(diffDays / 7);
      return diffDays >= 0 && weekNum % interval === 0;
    }
    case "monthly": {
      if (target.getDate() !== start.getDate()) return false;
      const m = monthsBetween(start, target);
      return m >= 0 && m % interval === 0;
    }
    case "yearly": {
      if (target.getMonth() !== start.getMonth() || target.getDate() !== start.getDate()) return false;
      const y = yearsBetween(start, target);
      return y >= 0 && y % interval === 0;
    }
    default:
      return false;
  }
}

function eventToEntry(ev: EventItem, date: string, instance = false): CalendarEntry {
  return {
    id: instance ? `${ev.id}:${date}` : ev.id,
    kind: "event",
    title: ev.title,
    date,
    time: ev.time,
    notes: ev.notes,
    location: ev.location,
    owner_id: ev.owner_id,
    owner_username: ev.owner_username,
    shared: ev.shared,
    remind_minutes_before: ev.remind_minutes_before,
    recurrence: ev.recurrence,
    source_id: ev.id,
    instance_date: instance ? date : ev.date,
    is_special: false,
  };
}

export function expandEvent(ev: EventItem, from: Date, to: Date): CalendarEntry[] {
  const start = startOfDay(parseYmd(ev.date));
  const rangeStart = startOfDay(from);
  const rangeEnd = startOfDay(to);
  const rec = ev.recurrence;

  if (!rec || rec.type === "none") {
    if (start >= rangeStart && start <= rangeEnd) return [eventToEntry(ev, ev.date)];
    return [];
  }

  const entries: CalendarEntry[] = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    if (cursor >= start && matchesRecurrence(start, cursor, rec)) {
      entries.push(eventToEntry(ev, toYmd(cursor), true));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return entries;
}

export function buildSpecialEntries(profiles: ProfileDates[], from: Date, to: Date): CalendarEntry[] {
  const rangeStart = startOfDay(from);
  const rangeEnd = startOfDay(to);
  const entries: CalendarEntry[] = [];

  for (const p of profiles) {
    if (p.birthday) {
      const src = parseYmd(p.birthday);
      for (let y = rangeStart.getFullYear(); y <= rangeEnd.getFullYear(); y++) {
        const d = new Date(y, src.getMonth(), src.getDate());
        if (d >= rangeStart && d <= rangeEnd) {
          entries.push({
            id: `birthday:${p.id}:${toYmd(d)}`,
            kind: "birthday",
            title: `${p.username}'s birthday`,
            date: toYmd(d),
            owner_id: p.id,
            owner_username: p.username,
            shared: true,
            is_special: true,
          });
        }
      }
    }
    if (p.anniversary) {
      const src = parseYmd(p.anniversary);
      for (let y = rangeStart.getFullYear(); y <= rangeEnd.getFullYear(); y++) {
        const d = new Date(y, src.getMonth(), src.getDate());
        if (d >= rangeStart && d <= rangeEnd) {
          const years = y - src.getFullYear();
          const label = years > 0 ? `${years} year anniversary` : "Anniversary";
          entries.push({
            id: `anniversary:${toYmd(d)}`,
            kind: "anniversary",
            title: label,
            date: toYmd(d),
            owner_id: p.id,
            owner_username: p.username,
            shared: true,
            is_special: true,
          });
        }
      }
    }
  }
  return entries;
}

export function buildCalendarEntries(
  events: EventItem[],
  profiles: ProfileDates[],
  from: Date,
  to: Date,
): CalendarEntry[] {
  const expanded = events.flatMap((ev) => expandEvent(ev, from, to));
  const special = buildSpecialEntries(profiles, from, to);
  return [...expanded, ...special].sort((a, b) => {
    const ka = `${a.date} ${a.time || "00:00"}`;
    const kb = `${b.date} ${b.time || "00:00"}`;
    return ka.localeCompare(kb);
  });
}

export function groupEntriesByMonth(entries: CalendarEntry[]): Record<string, { date: string; events: CalendarEntry[] }[]> {
  const byMonth: Record<string, { date: string; events: CalendarEntry[] }[]> = {};
  for (const ev of entries) {
    const d = parseYmd(ev.date);
    const monthKey = monthLabel(d);
    if (!byMonth[monthKey]) byMonth[monthKey] = [];
    const slot = byMonth[monthKey].find((s) => s.date === ev.date);
    if (slot) slot.events.push(ev);
    else byMonth[monthKey].push({ date: ev.date, events: [ev] });
  }
  return byMonth;
}

export function countEntriesByDate(entries: CalendarEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.date] = (counts[e.date] || 0) + 1;
  return counts;
}

export function formatRecurrence(rec?: Recurrence | null): string {
  if (!rec || rec.type === "none") return "";
  const names: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
  };
  const base = names[rec.type] || rec.type;
  if (rec.type === "weekly" && rec.weekdays?.length) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${base} · ${rec.weekdays.map((d) => days[d]).join(", ")}`;
  }
  if (rec.interval && rec.interval > 1) return `Every ${rec.interval} ${rec.type === "daily" ? "days" : rec.type.replace("ly", "s")}`;
  return base;
}

export function defaultRangeAround(month: Date): { from: Date; to: Date } {
  const from = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const to = new Date(month.getFullYear(), month.getMonth() + 13, 0);
  return { from: startOfDay(from), to: startOfDay(to) };
}
