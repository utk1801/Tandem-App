import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { ReminderPicker, type Reminder, dueDate } from "@/src/components/ReminderPicker";
import { scheduleReminder, cancelReminder } from "@/src/notifications";

type EventItem = {
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
};

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [creating, setCreating] = useState<EventItem | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [reminder, setReminder] = useState<Reminder>({ dueAt: null, remindMinutesBefore: null });
  const [share, setShare] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/events");
      setEvents(res.data || []);
    } catch {/* ignore */}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Group by month → list of dates → events
  const grouped = useMemo(() => {
    const byMonth: Record<string, { date: string; events: EventItem[] }[]> = {};
    const sorted = [...events].sort((a, b) => {
      const ka = `${a.date} ${a.time || "00:00"}`;
      const kb = `${b.date} ${b.time || "00:00"}`;
      return ka.localeCompare(kb);
    });
    for (const ev of sorted) {
      const d = new Date(ev.date + "T00:00:00");
      const monthKey = monthLabel(d);
      if (!byMonth[monthKey]) byMonth[monthKey] = [];
      const slot = byMonth[monthKey].find((s) => s.date === ev.date);
      if (slot) slot.events.push(ev);
      else byMonth[monthKey].push({ date: ev.date, events: [ev] });
    }
    return byMonth;
  }, [events]);

  const openCreate = () => {
    setCreating({} as EventItem);
    setTitle("");
    setNotes("");
    setLocation("");
    setReminder({ dueAt: null, remindMinutesBefore: null });
    setShare(false);
  };

  const submit = async () => {
    if (!title.trim() || !reminder.dueAt) return;
    const [datePart, timePart] = reminder.dueAt.split("T");
    const hhmm = timePart ? timePart.slice(0, 5) : null;
    const body: any = {
      title: title.trim(),
      date: datePart,
      time: hhmm,
      notes: notes.trim() || null,
      location: location.trim() || null,
      remind_minutes_before: reminder.remindMinutesBefore,
      share_with_partner: share,
    };
    const res = await api.post("/events", body);
    const ev: EventItem = res.data;
    setEvents((p) => [...p, ev]);

    // Schedule local reminder
    if (ev.remind_minutes_before !== null && ev.remind_minutes_before !== undefined && reminder.dueAt) {
      const target = dueDate(reminder.dueAt);
      if (target) {
        const fireAt = new Date(target.getTime() - ev.remind_minutes_before * 60 * 1000);
        await scheduleReminder(
          `event:${ev.id}`,
          ev.title,
          ev.location ? `📍 ${ev.location}` : "Coming up",
          fireAt,
        );
      }
    }
    setCreating(null);
  };

  const remove = async (ev: EventItem) => {
    setEvents((p) => p.filter((x) => x.id !== ev.id));
    await cancelReminder(`event:${ev.id}`);
    try { await api.delete(`/events/${ev.id}`); } catch {/* ignore */}
  };

  return (
    <View style={styles.root} testID="calendar-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Calendar</Text>
            <Text style={styles.subhead}>Important dates, side by side.</Text>
          </View>
          <Pressable
            testID="new-event-btn"
            onPress={openCreate}
            style={styles.headerCta}
          >
            <Feather name="plus" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {Object.keys(grouped).length === 0 ? (
          <View style={styles.empty}>
            <Feather name="calendar" size={28} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyTitle}>Nothing on the books</Text>
            <Text style={styles.emptyHint}>Add an event and you&apos;ll get a reminder when it&apos;s coming up.</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([month, days]) => (
            <View key={month} style={styles.monthBlock}>
              <Text style={styles.monthLabel}>{month}</Text>
              {days.map((slot) => {
                const d = new Date(slot.date + "T00:00:00");
                const day = d.getDate();
                const wd = d.toLocaleDateString(undefined, { weekday: "short" });
                return (
                  <View key={slot.date} style={styles.dayRow}>
                    <View style={styles.dayCol}>
                      <Text style={styles.dayWeekday}>{wd}</Text>
                      <Text style={styles.dayNum}>{day}</Text>
                    </View>
                    <View style={{ flex: 1, gap: spacing.sm }}>
                      {slot.events.map((ev) => (
                        <Pressable
                          key={ev.id}
                          testID={`event-${ev.id}`}
                          onLongPress={() => remove(ev)}
                          style={styles.eventCard}
                        >
                          <View style={styles.eventTitleRow}>
                            <Text style={styles.eventTitle} numberOfLines={2}>{ev.title}</Text>
                            {ev.time && <Text style={styles.eventTime}>{ev.time}</Text>}
                          </View>
                          {(ev.location || ev.shared || ev.owner_id !== user?.id) && (
                            <View style={styles.eventMetaRow}>
                              {ev.location && (
                                <View style={styles.metaItem}>
                                  <Feather name="map-pin" size={11} color={colors.onSurfaceSecondary} />
                                  <Text style={styles.eventMeta}>{ev.location}</Text>
                                </View>
                              )}
                              {ev.owner_id !== user?.id && (
                                <Text style={styles.eventMeta}>· by {ev.owner_username}</Text>
                              )}
                              {ev.shared && ev.owner_id === user?.id && (
                                <Text style={styles.eventMeta}>· shared</Text>
                              )}
                              {ev.remind_minutes_before !== null && ev.remind_minutes_before !== undefined && (
                                <View style={styles.metaItem}>
                                  <Feather name="bell" size={11} color={colors.brand} />
                                </View>
                              )}
                            </View>
                          )}
                          {ev.notes && <Text style={styles.eventNotes} numberOfLines={2}>{ev.notes}</Text>}
                        </Pressable>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      <Modal visible={!!creating} transparent animationType="slide" onRequestClose={() => setCreating(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setCreating(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>New event</Text>
              <TextInput
                testID="event-title-input"
                value={title}
                onChangeText={setTitle}
                placeholder="Event title"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.sheetTitleInput}
                autoFocus
              />
              <TextInput
                testID="event-location-input"
                value={location}
                onChangeText={setLocation}
                placeholder="Location (optional)"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.sheetInput}
              />
              <TextInput
                testID="event-notes-input"
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes (optional)"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.sheetInput, { minHeight: 70 }]}
                multiline
              />
              <ReminderPicker value={reminder} onChange={setReminder} />
              {user?.partner_id && (
                <View style={styles.shareRow}>
                  <Text style={styles.shareLabel}>Share with partner</Text>
                  <Switch testID="event-share-switch" value={share} onValueChange={setShare} trackColor={{ true: colors.brand, false: colors.borderStrong }} thumbColor="#fff" />
                </View>
              )}
              <Pressable
                testID="event-save-btn"
                onPress={submit}
                disabled={!title.trim() || !reminder.dueAt}
                style={[styles.sheetPrimary, (!title.trim() || !reminder.dueAt) && { opacity: 0.4 }]}
              >
                <Text style={styles.sheetPrimaryText}>Save event</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontFamily: fonts.display, fontSize: fontSize.xxxl, color: colors.onSurface },
  subhead: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  headerCta: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.xl, gap: spacing.xl },
  monthBlock: { gap: spacing.lg },
  monthLabel: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface, marginBottom: spacing.xs },
  dayRow: { flexDirection: "row", gap: spacing.lg },
  dayCol: { width: 48, alignItems: "center", paddingTop: 2 },
  dayWeekday: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  dayNum: { fontFamily: fonts.display, fontSize: 30, color: colors.brand, lineHeight: 34 },
  eventCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, gap: spacing.xs },
  eventTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  eventTitle: { flex: 1, fontFamily: fonts.display, fontSize: fontSize.lg, color: colors.onSurface, lineHeight: 20 },
  eventTime: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.brand },
  eventMetaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  eventMeta: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  eventNotes: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, lineHeight: 18, marginTop: 2 },
  empty: { padding: spacing.xxxl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  emptyHint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,25,23,0.4)" },
  sheet: { backgroundColor: colors.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "92%" },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.borderStrong, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  sheetTitleInput: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, paddingVertical: spacing.sm },
  sheetInput: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, textAlignVertical: "top" },
  shareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.xs },
  shareLabel: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  sheetPrimary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm },
  sheetPrimaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
});
