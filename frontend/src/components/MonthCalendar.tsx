import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { buildMonthGrid, toYmd } from "@/src/utils/calendar";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type Props = {
  month: Date;
  selectedDate?: Date | null;
  markedDates?: Record<string, number>;
  onMonthChange: (next: Date) => void;
  onSelectDate: (date: Date) => void;
  compact?: boolean;
};

export function MonthCalendar({
  month,
  selectedDate,
  markedDates = {},
  onMonthChange,
  onSelectDate,
  compact = false,
}: Props) {
  const weeks = useMemo(
    () => buildMonthGrid(month.getFullYear(), month.getMonth()),
    [month],
  );
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const selectedKey = selectedDate ? selectedDate.toDateString() : null;

  const prevMonth = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const nextMonth = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1));

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <Pressable onPress={prevMonth} hitSlop={10} style={styles.navBtn}>
          <Feather name="chevron-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.navLabel}>
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </Text>
        <Pressable onPress={nextMonth} hitSlop={10} style={styles.navBtn}>
          <Feather name="chevron-right" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={`${d}-${i}`} style={styles.weekday}>{d}</Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={styles.cell} />;
            const key = toYmd(day);
            const active = selectedKey === day.toDateString();
            const isToday = day.toDateString() === today.toDateString();
            const count = markedDates[key] || 0;
            return (
              <Pressable
                key={di}
                onPress={() => onSelectDate(day)}
                style={[styles.cell, active && styles.cellOn, isToday && !active && styles.cellToday]}
              >
                <Text style={[styles.dayNum, active && styles.dayNumOn, isToday && !active && styles.dayNumToday]}>
                  {day.getDate()}
                </Text>
                {count > 0 && (
                  <View style={[styles.dot, active && styles.dotOn]}>
                    {count > 1 && !compact ? (
                      <Text style={[styles.dotText, active && styles.dotTextOn]}>{count}</Text>
                    ) : null}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const cellSize = 40;

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  navLabel: { fontFamily: fonts.display, fontSize: fontSize.lg, color: colors.onSurface },
  weekRow: { flexDirection: "row" },
  weekday: {
    width: cellSize,
    textAlign: "center",
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    marginBottom: spacing.xs,
  },
  cell: {
    width: cellSize,
    height: cellSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  cellOn: { backgroundColor: colors.brand },
  cellToday: { borderWidth: 1, borderColor: colors.brand },
  dayNum: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface },
  dayNumOn: { color: "#fff", fontFamily: fonts.bodyMedium },
  dayNumToday: { color: colors.brand, fontFamily: fonts.bodyMedium },
  dot: {
    position: "absolute",
    bottom: 4,
    minWidth: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  dotOn: { backgroundColor: "#fff" },
  dotText: { fontFamily: fonts.body, fontSize: 8, color: colors.brand, lineHeight: 10 },
  dotTextOn: { color: colors.brand },
});
