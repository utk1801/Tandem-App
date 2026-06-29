import { useCallback, useState, useEffect, useRef } from "react";
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
  ScrollView,
  Image,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api, uploadImage } from "@/src/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { ReminderPicker, type Reminder, formatDue, dueDate } from "@/src/components/ReminderPicker";
import { RecurrencePicker, defaultRecurrence } from "@/src/components/RecurrencePicker";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";
import { scheduleReminder, cancelReminder } from "@/src/notifications";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { ItemKindPicker, type ItemKind } from "@/src/components/ItemKindPicker";
import { confirmDelete } from "@/src/utils/confirmDelete";
import { DocumentScanButton } from "@/src/components/DocumentScanButton";
import { NaturalLanguageListButton } from "@/src/components/NaturalLanguageListButton";
import type { Recurrence } from "@/src/types/calendar";
import { formatRecurrence } from "@/src/utils/calendar";
import { listTypeLabel, type ListType } from "@/src/utils/listTypes";

type Item = {
  id: string; text: string; qty?: string | null; done: boolean;
  assignee_id?: string | null; created_by: string;
  due_at?: string | null; remind_minutes_before?: number | null;
  recurrence?: Recurrence | null;
  kind?: ItemKind | null; url?: string | null; media_uri?: string | null;
};
type Detail = {
  id: string; name: string; type: ListType;
  custom_label?: string | null;
  owner_id: string; shared_with: string[]; items: Item[];
};

export default function ListDetail() {
  const { id, editItem } = useLocalSearchParams<{ id: string; editItem?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<Detail | null>(null);
  const [text, setText] = useState("");
  const [qty, setQty] = useState("");
  const [kind, setKind] = useState<ItemKind>("text");
  const [url, setUrl] = useState("");
  const [mediaUri, setMediaUri] = useState("");
  const [mediaPreview, setMediaPreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reminderVisible, setReminderVisible] = useState(false);
  const [reminder, setReminder] = useState<Reminder>({ dueAt: null, remindMinutesBefore: null });
  const [recurrence, setRecurrence] = useState<Recurrence>(defaultRecurrence());
  const [editVisible, setEditVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [listName, setListName] = useState("");
  const [shareList, setShareList] = useState(false);
  const [sharing, setSharing] = useState(false);
  const editOpenedRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/lists/${id}`);
      setData(res.data);
      setListName(res.data.name);
      setShareList((res.data.shared_with || []).length > 0);
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!editItem || !data?.items || editOpenedRef.current) return;
    const target = data.items.find((i) => i.id === editItem);
    if (target) {
      editOpenedRef.current = true;
      openEdit(target);
    }
  }, [editItem, data]);

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

  const buildItemBody = () => {
    const body: any = { text: text.trim(), kind };
    if (data?.type === "grocery" && qty.trim()) body.qty = qty.trim();
    if (reminder.dueAt) body.due_at = reminder.dueAt;
    if (reminder.remindMinutesBefore !== null) body.remind_minutes_before = reminder.remindMinutesBefore;
    if (recurrence.type !== "none") body.recurrence = recurrence;
    if (kind === "link" || kind === "video") body.url = url.trim();
    if (kind === "image" && mediaUri) body.media_uri = mediaUri;
    return body;
  };

  const resetComposer = () => {
    setText(""); setQty(""); setKind("text"); setUrl(""); setMediaUri(""); setMediaPreview("");
    setReminder({ dueAt: null, remindMinutesBefore: null });
    setRecurrence(defaultRecurrence());
  };

  const addItem = async () => {
    if (!text.trim() || !data || uploadingImage) return;
    if ((kind === "link" || kind === "video") && !url.trim()) return;
    if (kind === "image" && !mediaUri) return;
    const res = await api.post(`/lists/${id}/items`, buildItemBody());
    const item: Item = res.data;
    setData((d) => d ? { ...d, items: [...d.items, item] } : d);
    await scheduleForItem(item);
    resetComposer();
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploadingImage(true);
    try {
      const uploaded = await uploadImage(result.assets[0].uri);
      setMediaUri(uploaded.path);
      setMediaPreview(uploaded.url);
    } catch {
      /* ignore */
    } finally {
      setUploadingImage(false);
    }
  };

  const openEdit = (item: Item) => {
    setEditingItem(item);
    setText(item.text);
    setQty(item.qty || "");
    setKind((item.kind as ItemKind) || "text");
    setUrl(item.url || "");
    if (item.kind === "image" && item.media_uri) {
      if (item.media_uri.startsWith("http")) {
        setMediaPreview(item.media_uri);
        setMediaUri("");
      } else {
        setMediaUri(item.media_uri);
        setMediaPreview("");
      }
    } else {
      setMediaUri("");
      setMediaPreview("");
    }
    setReminder({ dueAt: item.due_at ?? null, remindMinutesBefore: item.remind_minutes_before ?? null });
    setRecurrence(item.recurrence || defaultRecurrence());
    setEditVisible(true);
  };

  const saveEdit = async () => {
    if (!editingItem || !text.trim() || uploadingImage) return;
    const body: any = { text: text.trim(), kind };
    if (data?.type === "grocery") body.qty = qty.trim() || null;
    body.due_at = reminder.dueAt;
    body.remind_minutes_before = reminder.remindMinutesBefore;
    body.recurrence = recurrence.type === "none" ? null : recurrence;
    body.url = (kind === "link" || kind === "video") ? url.trim() : null;
    if (kind === "image") {
      if (mediaUri) body.media_uri = mediaUri;
      else if (!mediaPreview) body.media_uri = null;
    } else {
      body.media_uri = null;
    }
    const res = await api.patch(`/items/${editingItem.id}`, body);
    setData((d) => d ? { ...d, items: d.items.map((i) => i.id === editingItem.id ? res.data : i) } : d);
    await scheduleForItem(res.data);
    setEditVisible(false);
    setEditingItem(null);
    resetComposer();
  };

  const toggleShare = async (next: boolean) => {
    if (!id || !data || data.owner_id !== user?.id) return;
    setSharing(true);
    setShareList(next);
    try {
      const res = await api.patch(`/lists/${id}`, { share_with_partner: next });
      setData((d) => d ? { ...d, shared_with: res.data.shared_with || [] } : d);
      setShareList((res.data.shared_with || []).length > 0);
    } catch {
      setShareList((data.shared_with || []).length > 0);
    } finally {
      setSharing(false);
    }
  };

  const toggle = async (item: Item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const nextDone = !item.done;
    setData((d) => d ? { ...d, items: d.items.map((i) => i.id === item.id ? { ...i, done: nextDone } : i) } : d);
    if (nextDone) await cancelReminder(`item:${item.id}`);
    try { await api.patch(`/items/${item.id}`, { done: nextDone }); } catch { load(); }
  };

  const remove = async (item: Item) => {
    confirmDelete("Delete item?", "This will remove it from the list.", async () => {
      setData((d) => d ? { ...d, items: d.items.filter((i) => i.id !== item.id) } : d);
      await cancelReminder(`item:${item.id}`);
      try { await api.delete(`/items/${item.id}`); } catch { load(); }
    });
  };

  const deleteList = async () => {
    if (!id) return;
    confirmDelete("Delete list?", "All items will be removed.", async () => {
      if (data) for (const it of data.items) await cancelReminder(`item:${it.id}`);
      await api.delete(`/lists/${id}`);
      router.back();
    });
  };

  const saveListName = async () => {
    if (!id || !listName.trim()) return;
    await api.patch(`/lists/${id}`, { name: listName.trim() });
    setData((d) => d ? { ...d, name: listName.trim() } : d);
    setRenameVisible(false);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (!data) return <SafeAreaView style={styles.center}><Text style={styles.empty}>List not found.</Text></SafeAreaView>;

  const isGrocery = data.type === "grocery";
  const dueLabel = formatDue(reminder.dueAt);
  const showUrlField = kind === "link" || kind === "video";
  const isOwner = data.owner_id === user?.id;
  const hasPartner = !!user?.partner_id;
  const typeLabel = listTypeLabel(data.type, data.custom_label);
  const imagePreview = mediaPreview || (mediaUri.startsWith("http") ? mediaUri : "");

  const renderComposerFields = () => (
    <>
      <ItemKindPicker value={kind} onChange={setKind} />
      {showUrlField && (
        <TextInput value={url} onChangeText={setUrl} placeholder={kind === "video" ? "Video URL" : "Web URL"} placeholderTextColor={colors.onSurfaceTertiary} style={styles.sheetInput} autoCapitalize="none" />
      )}
      {kind === "image" && (
        <View style={styles.imageRow}>
          {imagePreview ? <Image source={{ uri: imagePreview }} style={styles.thumb} /> : null}
          <Pressable onPress={pickImage} style={styles.secondaryBtn} disabled={uploadingImage}>
            {uploadingImage ? <ActivityIndicator color={colors.brand} size="small" /> : <Text style={styles.secondaryBtnText}>Pick image</Text>}
          </Pressable>
        </View>
      )}
      <ReminderPicker value={reminder} onChange={setReminder} />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
    </>
  );

  return (
    <View style={styles.root} testID="list-detail-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="back-btn">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => isOwner && setRenameVisible(true)}>
          <Text style={styles.kicker}>{typeLabel}</Text>
          <Text style={styles.title} numberOfLines={2}>{data.name}</Text>
        </Pressable>
        <NaturalLanguageListButton listId={id} listType={data.type} onComplete={load} compact />
        <DocumentScanButton listId={id} listType={data.type === "custom" ? "todo" : data.type} onComplete={load} compact />
        {isOwner && (
          <Pressable testID="delete-list-btn" onPress={deleteList} hitSlop={10}>
            <Feather name="trash-2" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        )}
      </SafeAreaView>

      {isOwner && hasPartner && (
        <View style={styles.shareRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.shareLabel}>Share with partner</Text>
            <Text style={styles.shareHint}>{shareList ? "Your partner can see this entire list" : "Only you can see this list"}</Text>
          </View>
          <Switch
            value={shareList}
            onValueChange={toggleShare}
            disabled={sharing}
            trackColor={{ false: colors.border, true: colors.brand }}
          />
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}>
        <FlatList
          data={[...data.items].sort((a, b) => Number(a.done) - Number(b.done))}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Feather name="circle" size={28} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyTitle}>List is empty</Text>
              <Text style={styles.emptyHint}>Add tasks, links, videos, or images below.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const due = formatDue(item.due_at ?? null);
            const overdue = !!item.due_at && !item.done && dueDate(item.due_at)!.getTime() < Date.now();
            const itemKind = item.kind || "text";
            return (
              <SwipeableRow onEdit={() => openEdit(item)} onDelete={() => remove(item)}>
                <View style={styles.row}>
                  <Pressable onPress={() => toggle(item)} style={styles.checkboxWrap}>
                    <View style={[styles.checkbox, item.done && styles.checkboxOn]}>
                      {item.done && <Feather name="check" size={14} color="#fff" />}
                    </View>
                  </Pressable>
                  <Pressable style={{ flex: 1 }} onPress={() => router.push(`/item/${item.id}`)}>
                    <View style={{ gap: 2 }}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.rowText, item.done && styles.rowTextDone]} numberOfLines={2}>{item.text}</Text>
                        {itemKind !== "text" && <Feather name={itemKind === "video" ? "play-circle" : itemKind === "image" ? "image" : "link"} size={14} color={colors.brand} />}
                      </View>
                      {due && (
                        <View style={styles.dueRow}>
                          <Feather name="clock" size={11} color={overdue ? colors.error : colors.onSurfaceSecondary} />
                          <Text style={[styles.dueText, overdue && { color: colors.error }]}>{due}</Text>
                        </View>
                      )}
                      {item.recurrence && item.recurrence.type !== "none" && (
                        <View style={styles.dueRow}>
                          <Feather name="repeat" size={11} color={colors.brand} />
                          <Text style={styles.dueText}>{formatRecurrence(item.recurrence)}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                  {item.qty && <Text style={styles.qtyTag}>{item.qty}</Text>}
                  <Feather name="chevron-right" size={16} color={colors.onSurfaceTertiary} />
                </View>
              </SwipeableRow>
            );
          }}
        />

        <View style={styles.composerWrap}>
          <ItemKindPicker value={kind} onChange={setKind} />
          {showUrlField && (
            <TextInput value={url} onChangeText={setUrl} placeholder={kind === "video" ? "Paste video URL" : "Paste link URL"} placeholderTextColor={colors.onSurfaceTertiary} style={styles.urlInput} autoCapitalize="none" />
          )}
          {kind === "image" && (
            <Pressable onPress={pickImage} style={styles.pickBtn} disabled={uploadingImage}>
              {uploadingImage ? <ActivityIndicator color={colors.brand} size="small" /> : <Feather name="image" size={16} color={colors.brand} />}
              <Text style={styles.pickBtnText}>{uploadingImage ? "Uploading…" : mediaUri ? "Change image" : "Attach image"}</Text>
            </Pressable>
          )}
          {dueLabel && (
            <View style={styles.pendingDue}>
              <Feather name="clock" size={12} color={colors.brand} />
              <Text style={styles.pendingDueText}>{dueLabel}</Text>
              <Pressable onPress={() => setReminder({ dueAt: null, remindMinutesBefore: null })} hitSlop={6}><Feather name="x" size={12} color={colors.brand} /></Pressable>
            </View>
          )}
          <View style={styles.composer}>
            <Pressable testID="open-reminder-btn" onPress={() => setReminderVisible(true)} style={styles.iconBtn}>
              <Feather name="bell" size={18} color={dueLabel ? colors.brand : colors.onSurfaceSecondary} />
            </Pressable>
            <TextInput testID="new-item-input" value={text} onChangeText={setText} placeholder={isGrocery ? "Add an item…" : "Add a task or memo…"} placeholderTextColor={colors.onSurfaceTertiary} style={styles.composerInput} onSubmitEditing={addItem} returnKeyType="send" />
            {isGrocery && <TextInput testID="new-item-qty-input" value={qty} onChangeText={setQty} placeholder="qty" placeholderTextColor={colors.onSurfaceTertiary} style={styles.qtyInput} onSubmitEditing={addItem} returnKeyType="send" />}
            <Pressable testID="add-item-btn" onPress={addItem} style={styles.addBtn} disabled={uploadingImage}><Feather name="arrow-up" size={20} color="#fff" /></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <SwipeableSheet visible={reminderVisible} onClose={() => setReminderVisible(false)}>
        <Text style={styles.sheetTitle}>Schedule this task</Text>
        <ReminderPicker value={reminder} onChange={setReminder} />
        <RecurrencePicker value={recurrence} onChange={setRecurrence} />
        <Pressable testID="reminder-done-btn" onPress={() => setReminderVisible(false)} style={styles.sheetPrimary}>
          <Text style={styles.sheetPrimaryText}>Done</Text>
        </Pressable>
      </SwipeableSheet>

      <SwipeableSheet visible={editVisible} onClose={() => setEditVisible(false)}>
        <Text style={styles.sheetTitle}>Edit item</Text>
        <TextInput value={text} onChangeText={setText} style={styles.sheetInput} placeholder="Title" placeholderTextColor={colors.onSurfaceTertiary} />
        {isGrocery && <TextInput value={qty} onChangeText={setQty} style={styles.sheetInput} placeholder="Qty" placeholderTextColor={colors.onSurfaceTertiary} />}
        {renderComposerFields()}
        <Pressable onPress={saveEdit} style={styles.sheetPrimary} disabled={uploadingImage}><Text style={styles.sheetPrimaryText}>Save changes</Text></Pressable>
      </SwipeableSheet>

      <SwipeableSheet visible={renameVisible} onClose={() => setRenameVisible(false)} scrollable={false}>
        <Text style={styles.sheetTitle}>Rename list</Text>
        <TextInput value={listName} onChangeText={setListName} style={styles.sheetInput} autoFocus />
        <Pressable onPress={saveListName} style={styles.sheetPrimary}><Text style={styles.sheetPrimaryText}>Save</Text></Pressable>
      </SwipeableSheet>
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
  shareRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary },
  shareLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onSurface },
  shareHint: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  list: { padding: spacing.xl, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  checkboxWrap: { padding: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowText: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, flex: 1 },
  rowTextDone: { color: colors.onSurfaceTertiary, textDecorationLine: "line-through" },
  dueRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dueText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  qtyTag: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  emptyBlock: { padding: spacing.xxxl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  emptyHint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  composerWrap: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  urlInput: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pickBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  pickBtnText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.brand },
  pendingDue: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  pendingDueText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.brand },
  composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.lg },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  composerInput: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, height: 44 },
  qtyInput: { width: 60, fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, height: 44, textAlign: "center" },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,25,23,0.4)" },
  sheet: { backgroundColor: colors.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "85%", gap: spacing.md },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.borderStrong, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  sheetInput: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  sheetPrimary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", marginTop: spacing.lg },
  sheetPrimaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
  imageRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  secondaryBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  secondaryBtnText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onSurface },
});
