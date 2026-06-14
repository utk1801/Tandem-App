import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { ReminderPicker, type Reminder, dueDate } from "@/src/components/ReminderPicker";
import { RecurrencePicker, defaultRecurrence } from "@/src/components/RecurrencePicker";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";
import { scheduleReminder, cancelReminder } from "@/src/notifications";
import { confirmDelete } from "@/src/utils/confirmDelete";
import type { Recurrence } from "@/src/types/calendar";
import { formatRecurrence } from "@/src/utils/calendar";

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
  recurrence?: Recurrence | null;
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [ev, setEv] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [reminder, setReminder] = useState<Reminder>({ dueAt: null, remindMinutesBefore: null });
  const [recurrence, setRecurrence] = useState<Recurrence>(defaultRecurrence());
  const [share, setShare] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/events/${id}`);
      setEv(res.data);
    } catch {
      setEv(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = () => {
    if (!ev) return;
    const dueAt = ev.time ? `${ev.date}T${ev.time}:00` : `${ev.date}T09:00:00`;
    setTitle(ev.title);
    setNotes(ev.notes || "");
    setLocation(ev.location || "");
    setReminder({ dueAt, remindMinutesBefore: ev.remind_minutes_before ?? null });
    setRecurrence(ev.recurrence || defaultRecurrence());
    setShare(!!ev.shared);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!ev || !title.trim() || !reminder.dueAt) return;
    const [datePart, timePart] = reminder.dueAt.split("T");
    const body = {
      title: title.trim(),
      date: datePart,
      time: timePart ? timePart.slice(0, 5) : null,
      notes: notes.trim() || null,
      location: location.trim() || null,
      remind_minutes_before: reminder.remindMinutesBefore,
      share_with_partner: share,
      recurrence: recurrence.type === "none" ? null : recurrence,
    };
    const res = await api.patch(`/events/${ev.id}`, body);
    setEv(res.data);
    await cancelReminder(`event:${ev.id}`);
    if (res.data.remind_minutes_before != null && reminder.dueAt) {
      const target = dueDate(reminder.dueAt);
      if (target) {
        const fireAt = new Date(target.getTime() - res.data.remind_minutes_before * 60 * 1000);
        await scheduleReminder(`event:${ev.id}`, res.data.title, res.data.location || "Coming up", fireAt);
      }
    }
    setEditing(false);
  };

  const onDelete = () => {
    if (!ev) return;
    confirmDelete("Delete event?", "This cannot be undone.", async () => {
      await cancelReminder(`event:${ev.id}`);
      await api.delete(`/events/${ev.id}`);
      router.back();
    });
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (!ev) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>Event not found.</Text>
      </SafeAreaView>
    );
  }

  const canEdit = ev.owner_id === user?.id;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Event</Text>
          <Text style={styles.title}>{ev.title}</Text>
        </View>
        {canEdit && (
          <>
            <Pressable onPress={openEdit} hitSlop={10}><Feather name="edit-2" size={20} color={colors.brand} /></Pressable>
            <Pressable onPress={onDelete} hitSlop={10}><Feather name="trash-2" size={20} color={colors.error} /></Pressable>
          </>
        )}
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.when}>{ev.date}{ev.time ? ` · ${ev.time}` : ""}</Text>
        {ev.recurrence && ev.recurrence.type !== "none" && (
          <View style={styles.row}>
            <Feather name="repeat" size={16} color={colors.brand} />
            <Text style={styles.bodyText}>{formatRecurrence(ev.recurrence)}</Text>
          </View>
        )}
        {ev.location && (
          <View style={styles.row}><Feather name="map-pin" size={16} color={colors.onSurfaceSecondary} /><Text style={styles.bodyText}>{ev.location}</Text></View>
        )}
        {ev.notes && <Text style={styles.notes}>{ev.notes}</Text>}
        <Text style={styles.meta}>
          {ev.owner_id === user?.id ? "You" : ev.owner_username}
          {ev.shared ? " · shared" : ""}
        </Text>
      </ScrollView>

      <SwipeableSheet visible={editing} onClose={() => setEditing(false)}>
        <Text style={styles.sheetTitle}>Edit event</Text>
        <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Title" placeholderTextColor={colors.onSurfaceTertiary} />
        <TextInput value={location} onChangeText={setLocation} style={styles.input} placeholder="Location" placeholderTextColor={colors.onSurfaceTertiary} />
        <TextInput value={notes} onChangeText={setNotes} style={[styles.input, { minHeight: 80 }]} multiline placeholder="Notes" placeholderTextColor={colors.onSurfaceTertiary} />
        <ReminderPicker value={reminder} onChange={setReminder} />
        <RecurrencePicker value={recurrence} onChange={setRecurrence} />
        {user?.partner_id && (
          <View style={styles.shareRow}>
            <Text style={styles.bodyText}>Share with partner</Text>
            <Switch value={share} onValueChange={setShare} trackColor={{ true: colors.brand, false: colors.borderStrong }} thumbColor="#fff" />
          </View>
        )}
        <Pressable onPress={saveEdit} style={styles.primary}><Text style={styles.primaryText}>Save</Text></Pressable>
      </SwipeableSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", gap: spacing.md, alignItems: "center" },
  kicker: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.brand, textTransform: "uppercase" },
  title: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  body: { padding: spacing.xl, gap: spacing.lg },
  when: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.brand },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bodyText: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  notes: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurfaceSecondary, lineHeight: 24 },
  meta: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  muted: { fontFamily: fonts.body, color: colors.onSurfaceSecondary },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  input: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  shareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  primary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center" },
  primaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
});
