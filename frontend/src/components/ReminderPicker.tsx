// Shared reminder-picker bottom-sheet content for choosing a due date,
// optional time, and a "remind me before" preset. Pure presentational — the
// hosting screen owns the modal and the submit/cancel actions.

import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { MonthCalendar } from "@/src/components/MonthCalendar";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";

export type Reminder = {
  /** ISO datetime string (e.g. 2026-06-13T09:00:00). Null = no due date. */
  dueAt: string | null;
  /** Minutes before dueAt to remind. Null = no reminder. */
  remindMinutesBefore: number | null;
};

const REMIND_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: "None", minutes: null },
  { label: "At time", minutes: 0 },
  { label: "5 min", minutes: 5 },
  { label: "30 min", minutes: 30 },
  { label: "1 hr", minutes: 60 },
  { label: "1 day", minutes: 60 * 24 },
  { label: "1 week", minutes: 60 * 24 * 7 },
];

function toLocalISO(date: Date, time?: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const t = time && /^\d{1,2}:\d{2}$/.test(time) ? time : "09:00";
  const [hh, mm] = t.split(":");
  return `${y}-${m}-${d}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:00`;
}

function parseISO(s: string | null): { date: Date | null; time: string | null } {
  if (!s) return { date: null, time: null };
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return { date: null, time: null };
  return {
    date: new Date(+m[1], +m[2] - 1, +m[3]),
    time: `${m[4]}:${m[5]}`,
  };
}

function dayKey(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function ReminderPicker({
  value,
  onChange,
}: {
  value: Reminder;
  onChange: (next: Reminder) => void;
}) {
  const parsed = parseISO(value.dueAt);
  const [time, setTime] = useState<string>(parsed.time || "09:00");
  const [pickerMonth, setPickerMonth] = useState(() => parsed.date || new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const presets: { label: string; date: Date }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    presets.push({
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayKey(d),
      date: d,
    });
  }

  const selectedDate = parsed.date;
  const selectedKey = selectedDate ? selectedDate.toDateString() : null;

  const setDate = (d: Date | null) => {
    if (!d) {
      onChange({ dueAt: null, remindMinutesBefore: null });
      return;
    }
    onChange({ dueAt: toLocalISO(d, time), remindMinutesBefore: value.remindMinutesBefore });
  };

  const setTimeAndProp = (t: string) => {
    setTime(t);
    if (selectedDate) {
      onChange({ dueAt: toLocalISO(selectedDate, t), remindMinutesBefore: value.remindMinutesBefore });
    }
  };

  const calendarLabel = selectedDate
    ? selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" })
    : "Choose date";

  return (
    <View style={styles.root}>
      <View style={styles.headRow}>
        <Text style={styles.sectionLabel}>Due date</Text>
        {selectedDate && (
          <Pressable testID="clear-due-btn" onPress={() => setDate(null)} hitSlop={8}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {presets.map((p) => {
          const active = selectedKey === p.date.toDateString();
          return (
            <Pressable
              key={p.label}
              testID={`due-preset-${p.label}`}
              onPress={() => setDate(p.date)}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text style={[styles.chipText, active && styles.chipTextOn]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        testID="open-calendar-btn"
        onPress={() => setCalendarOpen(true)}
        style={styles.dateBtn}
      >
        <Feather name="calendar" size={18} color={colors.brand} />
        <Text style={styles.dateBtnText}>{calendarLabel}</Text>
        <Feather name="chevron-right" size={16} color={colors.onSurfaceTertiary} />
      </Pressable>

      <SwipeableSheet visible={calendarOpen} onClose={() => setCalendarOpen(false)} scrollable={false}>
        <Text style={styles.calendarTitle}>Pick a date</Text>
        <MonthCalendar
          month={pickerMonth}
          selectedDate={selectedDate}
          onMonthChange={setPickerMonth}
          onSelectDate={(d) => {
            setPickerMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            setDate(d);
            setCalendarOpen(false);
          }}
          compact
        />
      </SwipeableSheet>

      {selectedDate && (
        <>
          <Text style={styles.sectionLabel}>Time</Text>
          <View style={styles.timeRow}>
            <Feather name="clock" size={16} color={colors.onSurfaceSecondary} />
            <TextInput
              testID="due-time-input"
              value={time}
              onChangeText={setTimeAndProp}
              placeholder="09:00"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.timeInput}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.timeHint}>HH:MM (24-hour)</Text>
          </View>

          <Text style={styles.sectionLabel}>Remind me</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {REMIND_OPTIONS.map((opt) => {
              const active = value.remindMinutesBefore === opt.minutes;
              return (
                <Pressable
                  key={opt.label}
                  testID={`remind-${opt.label.replace(/\s+/g, "-")}`}
                  onPress={() => onChange({ dueAt: value.dueAt, remindMinutesBefore: opt.minutes })}
                  style={[styles.chip, active && styles.chipOn]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextOn]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, letterSpacing: 0.5, textTransform: "uppercase", marginTop: spacing.sm },
  clear: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.brand, letterSpacing: 0.5, textTransform: "uppercase" },
  chips: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: { height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  chipTextOn: { color: "#fff" },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  dateBtnText: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface },
  calendarTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface, marginBottom: spacing.sm },
  timeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  timeInput: { fontFamily: fonts.body, fontSize: fontSize.xl, color: colors.onSurface, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, minWidth: 80 },
  timeHint: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
});

export function formatDue(dueAt: string | null): string {
  if (!dueAt) return "";
  const { date, time } = parseISO(dueAt);
  if (!date) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  let label: string;
  if (diff === 0) label = "Today";
  else if (diff === 1) label = "Tomorrow";
  else if (diff === -1) label = "Yesterday";
  else if (diff > 0 && diff < 7) label = date.toLocaleDateString(undefined, { weekday: "long" });
  else label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return time ? `${label} · ${time}` : label;
}

export function dueDate(dueAt: string | null): Date | null {
  const { date, time } = parseISO(dueAt);
  if (!date) return null;
  const [hh, mm] = (time || "09:00").split(":");
  date.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
  return date;
}
