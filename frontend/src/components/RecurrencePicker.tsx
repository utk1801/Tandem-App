import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import type { Recurrence, RecurrenceType } from "@/src/types/calendar";

const TYPES: { type: RecurrenceType; label: string }[] = [
  { type: "none", label: "None" },
  { type: "daily", label: "Daily" },
  { type: "weekly", label: "Weekly" },
  { type: "monthly", label: "Monthly" },
  { type: "yearly", label: "Yearly" },
];

const WEEKDAYS = [
  { d: 0, label: "S" },
  { d: 1, label: "M" },
  { d: 2, label: "T" },
  { d: 3, label: "W" },
  { d: 4, label: "T" },
  { d: 5, label: "F" },
  { d: 6, label: "S" },
];

export function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence;
  onChange: (next: Recurrence) => void;
}) {
  const setType = (type: RecurrenceType) => {
    if (type === "none") onChange({ type: "none" });
    else if (type === "weekly") onChange({ type, weekdays: value.weekdays?.length ? value.weekdays : [new Date().getDay()] });
    else onChange({ type, interval: value.interval || 1 });
  };

  const toggleWeekday = (d: number) => {
    const cur = value.weekdays || [];
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort();
    onChange({ ...value, type: "weekly", weekdays: next.length ? next : [d] });
  };

  return (
    <View style={styles.root}>
      <Text style={styles.sectionLabel}>Repeat</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {TYPES.map((t) => {
          const active = value.type === t.type;
          return (
            <Pressable
              key={t.type}
              onPress={() => setType(t.type)}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text style={[styles.chipText, active && styles.chipTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {value.type === "weekly" && (
        <>
          <Text style={styles.hint}>On these days</Text>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => {
              const active = value.weekdays?.includes(w.d);
              return (
                <Pressable
                  key={w.d}
                  onPress={() => toggleWeekday(w.d)}
                  style={[styles.dayBtn, active && styles.dayBtnOn]}
                >
                  <Text style={[styles.dayBtnText, active && styles.dayBtnTextOn]}>{w.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

export function defaultRecurrence(): Recurrence {
  return { type: "none" };
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  sectionLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.onSurfaceSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: spacing.sm,
  },
  chips: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  chipTextOn: { color: "#fff" },
  hint: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  weekRow: { flexDirection: "row", gap: spacing.sm },
  dayBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayBtnText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  dayBtnTextOn: { color: "#fff" },
});
