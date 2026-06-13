import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { ReminderPicker, type Reminder, formatDue, dueDate } from "@/src/components/ReminderPicker";
import { scheduleReminder, cancelReminder } from "@/src/notifications";

type Item = {
  id: string; text: string; qty?: string | null; done: boolean;
  assignee_id?: string | null; created_by: string;
  due_at?: string | null; remind_minutes_before?: number | null;
};
type Detail = {
  id: string; name: string; type: "todo" | "grocery" | "chores";
  owner_id: string; shared_with: string[]; items: Item[];
};

export default function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [text, setText] = useState("");
  const [qty, setQty] = useState("");
  const [loading, setLoading] = useState(true);
  const [reminderVisible, setReminderVisible] = useState(false);
  const [reminder, setReminder] = useState<Reminder>({ dueAt: null, remindMinutesBefore: null });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/lists/${id}`);
      setData(res.data);
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const scheduleForItem = async (item: Item) => {
    if (!item.due_at || item.remind_minutes_before === null || item.remind_minutes_before === undefined) {
      await cancelReminder(`item:${item.id}`);
      return;
    }
    const target = dueDate(item.due_at);
    if (!target) return;
    const fireAt = new Date(target.getTime() - item.remind_minutes_before * 60 * 1000);
    await scheduleReminder(`item:${item.id}`, item.text, "Task is due soon", fireAt);
  };

  const addItem = async () => {
    if (!text.trim() || !data) return;
    const body: any = { text: text.trim() };
    if (data.type === "grocery" && qty.trim()) body.qty = qty.trim();
    if (reminder.dueAt) body.due_at = reminder.dueAt;
    if (reminder.remindMinutesBefore !== null) body.remind_minutes_before = reminder.remindMinutesBefore;
    const res = await api.post(`/lists/${id}/items`, body);
    const item: Item = res.data;
    setData((d) => d ? { ...d, items: [...d.items, item] } : d);
    await scheduleForItem(item);
    setText(""); setQty("");
    setReminder({ dueAt: null, remindMinutesBefore: null });
  };

  const toggle = async (item: Item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const nextDone = !item.done;
    setData((d) => d ? { ...d, items: d.items.map((i) => i.id === item.id ? { ...i, done: nextDone } : i) } : d);
    if (nextDone) await cancelReminder(`item:${item.id}`);
    try {
      await api.patch(`/items/${item.id}`, { done: nextDone });
    } catch { load(); }
  };

  const remove = async (item: Item) => {
    setData((d) => d ? { ...d, items: d.items.filter((i) => i.id !== item.id) } : d);
    await cancelReminder(`item:${item.id}`);
    try { await api.delete(`/items/${item.id}`); } catch { load(); }
  };

  const deleteList = async () => {
    if (!id) return;
    try {
      // Cancel reminders for items in this list
      if (data) {
        for (const it of data.items) await cancelReminder(`item:${it.id}`);
      }
      await api.delete(`/lists/${id}`);
      router.back();
    } catch {/* not owner perhaps */}
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }
  if (!data) {
    return <SafeAreaView style={styles.center}><Text style={styles.empty}>List not found.</Text></SafeAreaView>;
  }

  const isGrocery = data.type === "grocery";
  const dueLabel = formatDue(reminder.dueAt);

  return (
    <View style={styles.root} testID="list-detail-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="back-btn">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{data.type === "todo" ? "To-do" : data.type === "grocery" ? "Grocery" : "Chores"}</Text>
          <Text style={styles.title} numberOfLines={2}>{data.name}</Text>
        </View>
        <Pressable testID="delete-list-btn" onPress={deleteList} hitSlop={10}>
          <Feather name="trash-2" size={20} color={colors.onSurfaceTertiary} />
        </Pressable>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}>
        <FlatList
          data={data.items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Feather name="circle" size={28} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyTitle}>List is empty</Text>
              <Text style={styles.emptyHint}>Add your first item below.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const due = formatDue(item.due_at ?? null);
            const overdue = !!item.due_at && !item.done && dueDate(item.due_at)!.getTime() < Date.now();
            return (
              <Pressable
                testID={`item-${item.id}`}
                onPress={() => toggle(item)}
                onLongPress={() => remove(item)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.checkbox, item.done && styles.checkboxOn]}>
                  {item.done && <Feather name="check" size={14} color="#fff" />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.rowText, item.done && styles.rowTextDone]} numberOfLines={2}>{item.text}</Text>
                  {due && (
                    <View style={styles.dueRow}>
                      <Feather name="clock" size={11} color={overdue ? colors.error : colors.onSurfaceSecondary} />
                      <Text style={[styles.dueText, overdue && { color: colors.error }]}>{due}</Text>
                      {item.remind_minutes_before !== null && item.remind_minutes_before !== undefined && (
                        <Feather name="bell" size={11} color={colors.brand} />
                      )}
                    </View>
                  )}
                </View>
                {item.qty && <Text style={styles.qtyTag}>{item.qty}</Text>}
              </Pressable>
            );
          }}
        />

        <View style={styles.composerWrap}>
          {dueLabel && (
            <View style={styles.pendingDue}>
              <Feather name="clock" size={12} color={colors.brand} />
              <Text style={styles.pendingDueText}>{dueLabel}</Text>
              <Pressable
                testID="clear-pending-due"
                onPress={() => setReminder({ dueAt: null, remindMinutesBefore: null })}
                hitSlop={6}
              >
                <Feather name="x" size={12} color={colors.brand} />
              </Pressable>
            </View>
          )}
          <View style={styles.composer}>
            <Pressable
              testID="open-reminder-btn"
              onPress={() => setReminderVisible(true)}
              style={styles.iconBtn}
            >
              <Feather name="bell" size={18} color={dueLabel ? colors.brand : colors.onSurfaceSecondary} />
            </Pressable>
            <TextInput
              testID="new-item-input"
              value={text}
              onChangeText={setText}
              placeholder={isGrocery ? "Add an item…" : "Add a task…"}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.composerInput}
              onSubmitEditing={addItem}
              returnKeyType="send"
            />
            {isGrocery && (
              <TextInput
                testID="new-item-qty-input"
                value={qty}
                onChangeText={setQty}
                placeholder="qty"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.qtyInput}
                onSubmitEditing={addItem}
                returnKeyType="send"
              />
            )}
            <Pressable testID="add-item-btn" onPress={addItem} style={styles.addBtn}>
              <Feather name="arrow-up" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={reminderVisible} transparent animationType="slide" onRequestClose={() => setReminderVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setReminderVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Schedule this task</Text>
              <ReminderPicker value={reminder} onChange={setReminder} />
              <Pressable testID="reminder-done-btn" onPress={() => setReminderVisible(false)} style={styles.sheetPrimary}>
                <Text style={styles.sheetPrimaryText}>Done</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  empty: { fontFamily: fonts.body, color: colors.onSurfaceSecondary },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: colors.surface },
  kicker: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.brand, letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface, marginTop: 2 },
  list: { padding: spacing.xl, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  rowText: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  rowTextDone: { color: colors.onSurfaceTertiary, textDecorationLine: "line-through" },
  dueRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dueText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  qtyTag: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  emptyBlock: { padding: spacing.xxxl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  emptyHint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  composerWrap: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  pendingDue: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 0 },
  pendingDueText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.brand },
  composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.lg },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  composerInput: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, height: 44 },
  qtyInput: { width: 60, fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, height: 44, textAlign: "center" },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,25,23,0.4)" },
  sheet: { backgroundColor: colors.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "85%" },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.borderStrong, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  sheetPrimary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", marginTop: spacing.lg },
  sheetPrimaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
});
