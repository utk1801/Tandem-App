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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";

type Item = {
  id: string; text: string; qty?: string; done: boolean;
  assignee_id?: string; created_by: string;
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

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/lists/${id}`);
      setData(res.data);
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addItem = async () => {
    if (!text.trim() || !data) return;
    const body: any = { text: text.trim() };
    if (data.type === "grocery" && qty.trim()) body.qty = qty.trim();
    const res = await api.post(`/lists/${id}/items`, body);
    setData((d) => d ? { ...d, items: [...d.items, res.data] } : d);
    setText(""); setQty("");
  };

  const toggle = async (item: Item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setData((d) => d ? { ...d, items: d.items.map((i) => i.id === item.id ? { ...i, done: !i.done } : i) } : d);
    try {
      await api.patch(`/items/${item.id}`, { done: !item.done });
    } catch { load(); }
  };

  const remove = async (item: Item) => {
    setData((d) => d ? { ...d, items: d.items.filter((i) => i.id !== item.id) } : d);
    try { await api.delete(`/items/${item.id}`); } catch { load(); }
  };

  const deleteList = async () => {
    if (!id) return;
    try {
      await api.delete(`/lists/${id}`);
      router.back();
    } catch {/* not owner perhaps */}
  };

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.empty}>List not found.</Text>
      </SafeAreaView>
    );
  }

  const isGrocery = data.type === "grocery";

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
          renderItem={({ item }) => (
            <Pressable
              testID={`item-${item.id}`}
              onPress={() => toggle(item)}
              onLongPress={() => remove(item)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.checkbox, item.done && styles.checkboxOn]}>
                {item.done && <Feather name="check" size={14} color="#fff" />}
              </View>
              <Text style={[styles.rowText, item.done && styles.rowTextDone]} numberOfLines={2}>
                {item.text}
              </Text>
              {item.qty && <Text style={styles.qtyTag}>{item.qty}</Text>}
            </Pressable>
          )}
        />

        <View style={styles.composer}>
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
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  empty: { fontFamily: fonts.body, color: colors.onSurfaceSecondary },
  header: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row",
    gap: spacing.md, alignItems: "center", backgroundColor: colors.surface,
  },
  kicker: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.brand, letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface, marginTop: 2 },
  list: { padding: spacing.xl, gap: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  rowText: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  rowTextDone: { color: colors.onSurfaceTertiary, textDecorationLine: "line-through" },
  qtyTag: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  emptyBlock: { padding: spacing.xxxl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  emptyHint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  composer: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
  composerInput: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, height: 44 },
  qtyInput: { width: 60, fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, height: 44, textAlign: "center" },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
