export type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "yearly";

export type Recurrence = {
  type: RecurrenceType;
  weekdays?: number[];
  interval?: number;
  end_date?: string | null;
};

export type EventItem = {
  id: string;
  owner_id: string;
  owner_username: string;
  title: string;
  date: string;
  time?: string | null;
  notes?: string | null;
  location?: string | null;
  remind_minutes_before?: number | null;
  shared: boolean;
  recurrence?: Recurrence | null;
};

export type CalendarEntryKind = "event" | "birthday" | "anniversary";

export type CalendarEntry = {
  id: string;
  kind: CalendarEntryKind;
  title: string;
  date: string;
  time?: string | null;
  notes?: string | null;
  location?: string | null;
  owner_id: string;
  owner_username: string;
  shared: boolean;
  remind_minutes_before?: number | null;
  recurrence?: Recurrence | null;
  source_id?: string;
  instance_date?: string;
  is_special?: boolean;
};

export type ProfileDates = {
  id: string;
  username: string;
  birthday?: string | null;
  anniversary?: string | null;
};
