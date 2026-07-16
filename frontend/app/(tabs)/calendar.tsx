import { useCallback, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, useScrollToTop } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { spacing, radius, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { ReminderPicker, type Reminder, dueDate } from "@/src/components/ReminderPicker";
import { scheduleReminder, cancelReminder } from "@/src/notifications";
import { confirmDelete } from "@/src/utils/confirmDelete";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";
import { MonthCalendar } from "@/src/components/MonthCalendar";
import { RecurrencePicker, defaultRecurrence } from "@/src/components/RecurrencePicker";
import type { CalendarEntry, EventItem, ProfileDates, Recurrence } from "@/src/types/calendar";
import {
  buildCalendarEntries,
  countEntriesByDate,
  defaultRangeAround,
  formatRecurrence,
  groupEntriesByMonth,
  parseYmd,
  startOfDay,
} from "@/src/utils/calendar";

function entryIcon(kind: CalendarEntry["kind"]) {
  if (kind === "birthday") return "gift";
  if (kind === "anniversary") return "heart";
  return "calendar";
}

export default function CalendarScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [profiles, setProfiles] = useState<ProfileDates[]>([]);
  const [monthSheetOpen, setMonthSheetOpen] = useState(false);
  const [gridMonth, setGridMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [creating, setCreating] = useState<EventItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [reminder, setReminder] = useState<Reminder>({ dueAt: null, remindMinutesBefore: null });
  const [recurrence, setRecurrence] = useState<Recurrence>(defaultRecurrence());
  const [share, setShare] = useState(false);
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  const load = useCallback(async () => {
    try {
      const [meRes, evRes, connRes] = await Promise.all([
        api.get("/auth/me"),
        api.get("/events"),
        api.get("/connection"),
      ]);
      setEvents(evRes.data || []);
      const me = meRes.data;
      const mine: ProfileDates = {
        id: me.id,
        username: me.username || "You",
        birthday: me.birthday,
        anniversary: me.anniversary,
      };
      const partner = connRes.data?.partner;
      const list = [mine];
      if (partner) {
        list.push({
          id: partner.id,
          username: partner.username,
          birthday: partner.birthday,
          anniversary: partner.anniversary,
        });
      }
      setProfiles(list);
    } catch {/* ignore */}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const range = useMemo(() => defaultRangeAround(gridMonth), [gridMonth]);
  const entries = useMemo(
    () => buildCalendarEntries(events, profiles, range.from, range.to),
    [events, profiles, range],
  );
  const upcomingEntries = useMemo(() => {
    const today = startOfDay(new Date());
    return entries.filter((e) => parseYmd(e.date) >= today);
  }, [entries]);
  const grouped = useMemo(() => groupEntriesByMonth(upcomingEntries), [upcomingEntries]);
  const markedDates = useMemo(() => countEntriesByDate(entries), [entries]);
  const dayEntries = useMemo(
    () => (selectedDay ? entries.filter((e) => e.date === selectedDay) : []),
    [entries, selectedDay],
  );

  const openCreate = (prefillDate?: string) => {
    setEditingId(null);
    setCreating({} as EventItem);
    setTitle("");
    setNotes("");
    setLocation("");
    setRecurrence(defaultRecurrence());
    setShare(false);
    if (prefillDate) {
      setReminder({ dueAt: `${prefillDate}T09:00:00`, remindMinutesBefore: null });
    } else {
      setReminder({ dueAt: null, remindMinutesBefore: null });
    }
  };

  const openEdit = (ev: EventItem) => {
    if (ev.owner_id !== user?.id) return;
    const dueAt = ev.time ? `${ev.date}T${ev.time}:00` : `${ev.date}T09:00:00`;
    setEditingId(ev.id);
    setCreating(ev);
    setTitle(ev.title);
    setNotes(ev.notes || "");
    setLocation(ev.location || "");
    setReminder({ dueAt, remindMinutesBefore: ev.remind_minutes_before ?? null });
    setRecurrence(ev.recurrence || defaultRecurrence());
    setShare(!!ev.shared);
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
      recurrence: recurrence.type === "none" ? null : recurrence,
    };
    if (editingId) {
      const res = await api.patch(`/events/${editingId}`, body);
      const ev: EventItem = res.data;
      setEvents((p) => p.map((x) => (x.id === ev.id ? ev : x)));
      await cancelReminder(`event:${ev.id}`);
      if (ev.remind_minutes_before != null && reminder.dueAt) {
        const target = dueDate(reminder.dueAt);
        if (target) {
          const fireAt = new Date(target.getTime() - ev.remind_minutes_before * 60 * 1000);
          await scheduleReminder(`event:${ev.id}`, ev.title, ev.location ? `📍 ${ev.location}` : "Coming up", fireAt);
        }
      }
      setCreating(null);
      setEditingId(null);
      return;
    }
    const res = await api.post("/events", body);
    const ev: EventItem = res.data;
    setEvents((p) => [...p, ev]);
    if (ev.remind_minutes_before !== null && ev.remind_minutes_before !== undefined && reminder.dueAt) {
      const target = dueDate(reminder.dueAt);
      if (target) {
        const fireAt = new Date(target.getTime() - ev.remind_minutes_before * 60 * 1000);
        await scheduleReminder(`event:${ev.id}`, ev.title, ev.location ? `📍 ${ev.location}` : "Coming up", fireAt);
      }
    }
    setCreating(null);
  };

  const remove = async (entry: CalendarEntry) => {
    if (entry.kind !== "event" || !entry.source_id) return;
    const ev = events.find((e) => e.id === entry.source_id);
    if (!ev || ev.owner_id !== user?.id) return;
    confirmDelete("Delete event?", "This cannot be undone.", async () => {
      setEvents((p) => p.filter((x) => x.id !== ev.id));
      await cancelReminder(`event:${ev.id}`);
      try { await api.delete(`/events/${ev.id}`); } catch {/* ignore */}
    });
  };

  const onEntryPress = (entry: CalendarEntry) => {
    if (entry.kind === "event" && entry.source_id) {
      router.push(`/event/${entry.source_id}`);
    }
  };

  const renderEntryCard = (ev: CalendarEntry, swipeable: boolean) => {
    const isSpecial = ev.is_special;
    const canEdit = ev.kind === "event" && ev.owner_id === user?.id;
    const card = (
      <Pressable
        testID={`event-${ev.id}`}
        onPress={() => onEntryPress(ev)}
        style={[styles.eventCard, isSpecial && styles.eventCardSpecial]}
      >
        <View style={styles.eventTitleRow}>
          <View style={styles.eventTitleLeft}>
            {isSpecial && (
              <Feather
                name={entryIcon(ev.kind) as any}
                size={14}
                color={ev.kind === "birthday" ? colors.warning : colors.brand}
              />
            )}
            <Text style={styles.eventTitle} numberOfLines={2}>{ev.title}</Text>
          </View>
          {ev.time && <Text style={styles.eventTime}>{ev.time}</Text>}
        </View>
        {(ev.location || ev.shared || ev.owner_id !== user?.id || ev.recurrence) && (
          <View style={styles.eventMetaRow}>
            {ev.location && (
              <View style={styles.metaItem}>
                <Feather name="map-pin" size={11} color={colors.onSurfaceSecondary} />
                <Text style={styles.eventMeta}>{ev.location}</Text>
              </View>
            )}
            {ev.recurrence && ev.recurrence.type !== "none" && (
              <View style={styles.metaItem}>
                <Feather name="repeat" size={11} color={colors.brand} />
                <Text style={styles.eventMeta}>{formatRecurrence(ev.recurrence)}</Text>
              </View>
            )}
            {ev.owner_id !== user?.id && <Text style={styles.eventMeta}>· by {ev.owner_username}</Text>}
            {ev.shared && ev.owner_id === user?.id && <Text style={styles.eventMeta}>· shared</Text>}
          </View>
        )}
        {ev.notes && <Text style={styles.eventNotes} numberOfLines={2}>{ev.notes}</Text>}
      </Pressable>
    );
    if (!swipeable || !canEdit) return card;
    const source = events.find((e) => e.id === ev.source_id);
    if (!source) return card;
    return (
      <SwipeableRow canEdit canDelete onEdit={() => openEdit(source)} onDelete={() => remove(ev)}>
        {card}
      </SwipeableRow>
    );
  };

  const upcomingSpecial = useMemo(() => {
    const today = startOfDay(new Date());
    return entries.filter((e) => e.is_special && parseYmd(e.date) >= today).slice(0, 3);
  }, [entries]);

  const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  viewToggle: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  heading: { fontFamily: fonts.display, fontSize: fontSize.xxxl, color: colors.onSurface },
  subhead: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  headerCta: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.xl, gap: spacing.xl },
  specialBanner: { borderWidth: 1, borderColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.brandTertiary },
  specialLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onBrandTertiary, letterSpacing: 0.5, textTransform: "uppercase" },
  specialRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  specialText: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onBrandTertiary },
  specialWhen: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.brand },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  dayPanelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayPanelTitle: { fontFamily: fonts.display, fontSize: fontSize.lg, color: colors.onSurface, flex: 1 },
  dayEmpty: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  monthBlock: { gap: spacing.lg },
  monthLabel: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface, marginBottom: spacing.xs },
  dayRow: { flexDirection: "row", gap: spacing.lg },
  dayCol: { width: 48, alignItems: "center", paddingTop: 2 },
  dayWeekday: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  dayNum: { fontFamily: fonts.display, fontSize: 30, color: colors.brand, lineHeight: 34 },
  eventCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, gap: spacing.xs },
  eventCardSpecial: { borderColor: colors.brandTertiary, backgroundColor: colors.brandTertiary },
  eventTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  eventTitleLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  eventTitle: { flex: 1, fontFamily: fonts.display, fontSize: fontSize.lg, color: colors.onSurface, lineHeight: 20 },
  eventTime: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.brand },
  eventMetaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  eventMeta: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  eventNotes: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, lineHeight: 18, marginTop: 2 },
  empty: { padding: spacing.xxxl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  emptyHint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  dayPanel: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surfaceSecondary },
  sheetTitleInput: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, paddingVertical: spacing.sm },
  sheetInput: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, textAlignVertical: "top" },
  shareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.xs },
  shareLabel: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  sheetPrimary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm },
  sheetPrimaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
});

  return (
    <View style={styles.root} testID="calendar-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Calendar</Text>
            <Text style={styles.subhead}>Important dates, side by side.</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              testID="calendar-month-btn"
              onPress={() => setMonthSheetOpen(true)}
              style={styles.viewToggle}
            >
              <Feather name="calendar" size={18} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="new-event-btn" onPress={() => openCreate()} style={styles.headerCta}>
              <Feather name="plus" size={20} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {upcomingSpecial.length > 0 && (
          <View style={styles.specialBanner}>
            <Text style={styles.specialLabel}>Coming up for you</Text>
            {upcomingSpecial.map((e) => (
              <View key={e.id} style={styles.specialRow}>
                <Feather name={entryIcon(e.kind) as any} size={14} color={colors.brand} />
                <Text style={styles.specialText}>{e.title}</Text>
                <Text style={styles.specialWhen}>
                  {parseYmd(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="calendar" size={28} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyTitle}>Nothing on the books</Text>
            <Text style={styles.emptyHint}>Add an event or open the month view to browse dates.</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([month, days]) => (
            <View key={month} style={styles.monthBlock}>
              <Text style={styles.monthLabel}>{month}</Text>
              {days.map((slot) => {
                const d = parseYmd(slot.date);
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
                        <View key={ev.id}>{renderEntryCard(ev, true)}</View>
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

      <SwipeableSheet visible={monthSheetOpen} onClose={() => setMonthSheetOpen(false)}>
        <Text style={styles.sheetTitle}>Month view</Text>
        <MonthCalendar
          month={gridMonth}
          markedDates={markedDates}
          selectedDate={selectedDay ? parseYmd(selectedDay) : null}
          onMonthChange={setGridMonth}
          onSelectDate={(d) => {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            setSelectedDay(key);
          }}
        />
        {selectedDay && (
          <View style={styles.dayPanel}>
            <View style={styles.dayPanelHead}>
              <Text style={styles.dayPanelTitle}>
                {parseYmd(selectedDay).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </Text>
              <Pressable onPress={() => { setMonthSheetOpen(false); openCreate(selectedDay); }} hitSlop={8}>
                <Feather name="plus-circle" size={20} color={colors.brand} />
              </Pressable>
            </View>
            {dayEntries.length === 0 ? (
              <Text style={styles.dayEmpty}>Nothing scheduled — tap + to add.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {dayEntries.map((ev) => (
                  <View key={ev.id}>{renderEntryCard(ev, true)}</View>
                ))}
              </View>
            )}
          </View>
        )}
      </SwipeableSheet>

      <SwipeableSheet visible={!!creating} onClose={() => { setCreating(null); setEditingId(null); }}>
        <Text style={styles.sheetTitle}>{editingId ? "Edit event" : "New event"}</Text>
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
        <RecurrencePicker value={recurrence} onChange={setRecurrence} />
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
          <Text style={styles.sheetPrimaryText}>{editingId ? "Save changes" : "Save event"}</Text>
        </Pressable>
      </SwipeableSheet>
    </View>
  );
}
