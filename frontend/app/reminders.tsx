import { useCallback, useEffect, useState } from "react";
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
import { useRouter } from "expo-router";
import { useAuth } from "@/src/contexts/AuthContext";
import { Feather } from "@expo/vector-icons";
import { spacing, radius, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/contexts/ThemeContext";
import { ReminderPicker, type Reminder, dueDate, formatDue } from "@/src/components/ReminderPicker";
import { RecurrencePicker, defaultRecurrence } from "@/src/components/RecurrencePicker";
import type { Recurrence } from "@/src/types/calendar";
import { scheduleReminder, cancelReminder, ensurePermissions } from "@/src/notifications";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { confirmDelete } from "@/src/utils/confirmDelete";
import { api } from "@/src/api";

type ReminderItem = {
  id: string;
  title: string;
  notes: string;
  dueAt: string | null;
  remindMinutesBefore: number | null;
  recurrence: Recurrence;
  sharedWithPartner?: boolean;
};

function toLocal(row: Record<string, unknown>): ReminderItem {
  return {
    id: row.id as string,
    title: row.title as string,
    notes: (row.notes as string) ?? "",
    dueAt: (row.due_at as string | null) ?? null,
    remindMinutesBefore: (row.remind_minutes_before as number | null) ?? null,
    recurrence: (row.recurrence as Recurrence) ?? { type: "none" },
    sharedWithPartner: (row.shared_with_partner as boolean) ?? false,
  };
}

const REMIND_LABELS: Record<number, string> = {
  0: "At time",
  5: "5 min before",
  30: "30 min before",
  60: "1 hr before",
  1440: "1 day before",
  10080: "1 week before",
};

function remindLabel(minutes: number | null): string | null {
  if (minutes == null) return null;
  return REMIND_LABELS[minutes] ?? `${minutes} min before`;
}

export default function RemindersScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [reminder, setReminder] = useState<Reminder>({ dueAt: null, remindMinutesBefore: null });
  const [recurrence, setRecurrence] = useState<Recurrence>(defaultRecurrence());
  const [sharedWithPartner, setSharedWithPartner] = useState(false);

  useEffect(() => {
    api.get("/reminders").then((r) => setItems(r.data.map(toLocal))).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setTitle("");
    setNotes("");
    setReminder({ dueAt: null, remindMinutesBefore: null });
    setRecurrence(defaultRecurrence());
    setSharedWithPartner(false);
    setSheetOpen(true);
  };

  const openEdit = useCallback((item: ReminderItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setNotes(item.notes);
    setReminder({ dueAt: item.dueAt, remindMinutesBefore: item.remindMinutesBefore });
    setRecurrence(item.recurrence ?? defaultRecurrence());
    setSharedWithPartner(item.sharedWithPartner ?? false);
    setSheetOpen(true);
  }, []);

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingId(null);
  };

  const submit = async () => {
    if (!title.trim()) return;
    await ensurePermissions();

    const scheduleItem = async (item: ReminderItem) => {
      const baseKey = `reminder:${item.id}`;
      // cancel existing (up to 10 slots)
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => cancelReminder(i === 0 ? baseKey : `${baseKey}:${i}`))
      );
      const fireDates = _fireDates(item);
      await Promise.all(
        fireDates.map((d, i) =>
          scheduleReminder(
            i === 0 ? baseKey : `${baseKey}:${i}`,
            item.title,
            item.notes || "Reminder",
            d,
          )
        )
      );
    };

    const body = {
      title: title.trim(),
      notes: notes.trim(),
      due_at: reminder.dueAt,
      remind_minutes_before: reminder.remindMinutesBefore,
      recurrence,
      shared_with_partner: sharedWithPartner,
    };
    if (editingId) {
      const res = await api.patch(`/reminders/${editingId}`, body);
      const updated = toLocal(res.data);
      await scheduleItem(updated);
      setItems((prev) => prev.map((x) => (x.id === editingId ? updated : x)));
    } else {
      const res = await api.post("/reminders", body);
      const item = toLocal(res.data);
      await scheduleItem(item);
      setItems((prev) => [...prev, item]);
    }
    closeSheet();
  };

  const remove = useCallback((item: ReminderItem) => {
    confirmDelete("Delete reminder?", "This cannot be undone.", async () => {
      const baseKey = `reminder:${item.id}`;
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => cancelReminder(i === 0 ? baseKey : `${baseKey}:${i}`))
      );
      await api.delete(`/reminders/${item.id}`).catch(() => {});
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    });
  }, []);

  const now = new Date();
  const upcoming = items
    .filter((x) => {
      const f = _fireDate(x);
      return f && f > now;
    })
    .sort((a, b) => {
      const fa = _fireDate(a)!.getTime();
      const fb = _fireDate(b)!.getTime();
      return fa - fb;
    });
  const past = items.filter((x) => {
    const f = _fireDate(x);
    return !f || f <= now;
  });

  const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1 },
  heading: { fontFamily: fonts.display, fontSize: fontSize.xxxl, color: colors.onSurface },
  subhead: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { padding: spacing.xl, gap: spacing.xl },
  empty: {
    marginTop: spacing.xxxl,
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  emptyHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyCta: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  emptyCtaText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: "#fff" },
  group: { gap: spacing.md },
  groupLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.onSurfaceSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  groupList: { gap: spacing.sm },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "flex-start",
  },
  cardPast: { opacity: 0.55 },
  cardLeft: { paddingTop: 2 },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    lineHeight: 22,
  },
  cardTitlePast: { color: colors.onSurfaceSecondary },
  cardNotes: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
  },
  cardMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  cardMetaText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.brand,
  },
  cardMetaDot: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  cardMetaPast: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: fontSize.xxl,
    color: colors.onSurface,
  },
  sheetTitleInput: {
    fontFamily: fonts.display,
    fontSize: fontSize.xl,
    color: colors.onSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    paddingVertical: spacing.sm,
  },
  sheetInput: {
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  sheetPrimary: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  sheetPrimaryText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.lg,
    color: "#fff",
  },
  shareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.xs },
  shareLabel: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
});

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.heading}>Reminders</Text>
            <Text style={styles.subhead}>Never miss a moment.</Text>
          </View>
          <Pressable onPress={openCreate} style={styles.addBtn} testID="new-reminder-btn">
            <Feather name="plus" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="bell" size={32} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyTitle}>No reminders yet</Text>
            <Text style={styles.emptyHint}>
              Tap + to add one. Notifications fire on your device — no internet needed.
            </Text>
            <Pressable onPress={openCreate} style={styles.emptyCta}>
              <Text style={styles.emptyCtaText}>Add reminder</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {upcoming.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupLabel}>Upcoming</Text>
                <View style={styles.groupList}>
                  {upcoming.map((item) => (
                    <ReminderCard
                      key={item.id}
                      item={item}
                      onEdit={openEdit}
                      onDelete={remove}
                    />
                  ))}
                </View>
              </View>
            )}
            {past.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupLabel}>No date set or past</Text>
                <View style={styles.groupList}>
                  {past.map((item) => (
                    <ReminderCard
                      key={item.id}
                      item={item}
                      onEdit={openEdit}
                      onDelete={remove}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      <SwipeableSheet visible={sheetOpen} onClose={closeSheet}>
        <Text style={styles.sheetTitle}>{editingId ? "Edit reminder" : "New reminder"}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="What do you want to remember?"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.sheetTitleInput}
          autoFocus
          testID="reminder-title-input"
        />
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={[styles.sheetInput, { minHeight: 60 }]}
          multiline
          testID="reminder-notes-input"
        />
        <ReminderPicker value={reminder} onChange={setReminder} />
        <RecurrencePicker value={recurrence} onChange={setRecurrence} />
        {user?.partner_id && (
          <View style={styles.shareRow}>
            <Text style={styles.shareLabel}>Share with partner</Text>
            <Switch
              value={sharedWithPartner}
              onValueChange={setSharedWithPartner}
              trackColor={{ true: colors.brand, false: colors.borderStrong }}
              thumbColor="#fff"
            />
          </View>
        )}
        <Pressable
          onPress={submit}
          disabled={!title.trim()}
          style={[styles.sheetPrimary, !title.trim() && { opacity: 0.4 }]}
          testID="reminder-save-btn"
        >
          <Text style={styles.sheetPrimaryText}>{editingId ? "Save changes" : "Save reminder"}</Text>
        </Pressable>
      </SwipeableSheet>
    </View>
  );
}

function _fireDate(item: ReminderItem): Date | null {
  if (!item.dueAt) return null;
  const due = dueDate(item.dueAt);
  if (!due) return null;
  const mins = item.remindMinutesBefore ?? 0;
  return new Date(due.getTime() - mins * 60 * 1000);
}

// Returns up to 10 upcoming fire dates honoring recurrence
function _fireDates(item: ReminderItem): Date[] {
  const base = _fireDate(item);
  if (!base) return [];
  const rec = item.recurrence ?? { type: "none" };
  if (rec.type === "none") return [base];
  const now = new Date();
  const results: Date[] = [];
  let cursor = new Date(base);
  let iterations = 0;
  while (results.length < 10 && iterations < 200) {
    iterations++;
    if (cursor > now) results.push(new Date(cursor));
    if (rec.type === "daily") cursor.setDate(cursor.getDate() + 1);
    else if (rec.type === "weekly") {
      if (rec.weekdays?.length) {
        cursor.setDate(cursor.getDate() + 1);
        while (!rec.weekdays.includes(cursor.getDay())) cursor.setDate(cursor.getDate() + 1);
      } else {
        cursor.setDate(cursor.getDate() + 7);
      }
    } else if (rec.type === "monthly") cursor.setMonth(cursor.getMonth() + 1);
    else if (rec.type === "yearly") cursor.setFullYear(cursor.getFullYear() + 1);
    else break;
  }
  return results;
}

function recurrenceLabel(rec: Recurrence): string | null {
  if (rec.type === "none") return null;
  if (rec.type === "daily") return "Daily";
  if (rec.type === "weekly") return rec.weekdays?.length ? "Weekly" : "Weekly";
  if (rec.type === "monthly") return "Monthly";
  if (rec.type === "yearly") return "Yearly";
  return null;
}

function ReminderCard({
  item,
  onEdit,
  onDelete,
}: {
  item: ReminderItem;
  onEdit: (item: ReminderItem) => void;
  onDelete: (item: ReminderItem) => void;
}) {
  const { colors } = useTheme();
  const styles = StyleSheet.create({
    card: { flexDirection: "row", gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, alignItems: "flex-start" },
    cardPast: { opacity: 0.55 },
    cardLeft: { paddingTop: 2 },
    cardBody: { flex: 1, gap: 4 },
    cardTitle: { fontFamily: fonts.display, fontSize: fontSize.lg, color: colors.onSurface, lineHeight: 22 },
    cardTitlePast: { color: colors.onSurfaceSecondary },
    cardNotes: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, lineHeight: 18 },
    cardMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
    cardMetaText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.brand },
    cardMetaDot: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
    cardMetaPast: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  });
  const fireAt = _fireDate(item);
  const now = new Date();
  const isPast = fireAt ? fireAt <= now : false;
  const rl = remindLabel(item.remindMinutesBefore);
  const recLabel = recurrenceLabel(item.recurrence ?? { type: "none" });

  const card = (
    <Pressable
      onPress={() => onEdit(item)}
      style={[styles.card, isPast && styles.cardPast]}
      testID={`reminder-${item.id}`}
    >
      <View style={styles.cardLeft}>
        <Feather
          name="bell"
          size={16}
          color={isPast ? colors.onSurfaceTertiary : colors.brand}
        />
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, isPast && styles.cardTitlePast]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.notes ? (
          <Text style={styles.cardNotes} numberOfLines={1}>{item.notes}</Text>
        ) : null}
        <View style={styles.cardMeta}>
          {item.dueAt && (
            <Text style={[styles.cardMetaText, isPast && styles.cardMetaPast]}>
              {formatDue(item.dueAt)}
            </Text>
          )}
          {rl && item.dueAt && (
            <Text style={styles.cardMetaDot}> · </Text>
          )}
          {rl && (
            <Text style={[styles.cardMetaText, isPast && styles.cardMetaPast]}>{rl}</Text>
          )}
          {!item.dueAt && (
            <Text style={styles.cardMetaPast}>No date set</Text>
          )}
          {recLabel && (
            <>
              <Text style={styles.cardMetaDot}> · </Text>
              <Text style={[styles.cardMetaText, isPast && styles.cardMetaPast]}>{recLabel}</Text>
            </>
          )}
          {item.sharedWithPartner && (
            <>
              <Text style={styles.cardMetaDot}> · </Text>
              <Text style={[styles.cardMetaText, isPast && styles.cardMetaPast]}>Shared</Text>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );

  return (
    <SwipeableRow canEdit canDelete onEdit={() => onEdit(item)} onDelete={() => onDelete(item)}>
      {card}
    </SwipeableRow>
  );
}
