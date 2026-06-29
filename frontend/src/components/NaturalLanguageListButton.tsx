import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";
import { useRouter } from "expo-router";
import { BUILT_IN_TYPES, listTypeLabel, type ListType } from "@/src/utils/listTypes";

type ReviewItem = {
  id: string;
  text: string;
  qty: string;
  selected: boolean;
};

type ParseResult = {
  list_name?: string | null;
  type: ListType;
  custom_label?: string | null;
  items: { text: string; qty?: string | null }[];
  used_ai?: boolean;
};

type Props = {
  listId?: string;
  listType?: ListType;
  onComplete?: () => void;
  compact?: boolean;
};

export function NaturalLanguageListButton({ listId, listType, onComplete, compact }: Props) {
  const router = useRouter();
  const [inputOpen, setInputOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [usedAI, setUsedAI] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [listName, setListName] = useState("");
  const [newListType, setNewListType] = useState<ListType>(listType || "todo");
  const [customLabel, setCustomLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setInputText("");
    setItems([]);
    setListName("");
    setCustomLabel("");
    setNewListType(listType || "todo");
    setUsedAI(false);
  };

  const parse = async () => {
    const text = inputText.trim();
    if (!text) {
      Alert.alert("Say something", "Describe what you want on the list.");
      return;
    }
    setParsing(true);
    try {
      const body: Record<string, string> = { text };
      if (listId) body.list_id = listId;
      const res = await api.post("/lists/parse-natural-language", body);
      const data = res.data as ParseResult;
      if (!data.items?.length) {
        Alert.alert("No items found", "Try being more specific, e.g. \"milk, eggs, call plumber\".");
        return;
      }
      setUsedAI(!!data.used_ai);
      setListName(data.list_name?.trim() || (listId ? "" : "Quick list"));
      setNewListType(listId ? (listType || "todo") : (data.type || "todo"));
      setCustomLabel(data.custom_label?.trim() || "");
      setItems(
        data.items.map((item, idx) => ({
          id: String(idx),
          text: item.text,
          qty: item.qty || "",
          selected: true,
        })),
      );
      setInputOpen(false);
      setReviewOpen(true);
    } catch (e: any) {
      Alert.alert("Parse failed", e?.message || "Could not understand that text.");
    } finally {
      setParsing(false);
    }
  };

  const toggleItem = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));
  };

  const save = async () => {
    const selected = items.filter((i) => i.selected && i.text.trim());
    if (!selected.length) {
      Alert.alert("Nothing selected", "Select at least one item to add.");
      return;
    }

    setSaving(true);
    try {
      let targetListId = listId;
      let targetType = listType || newListType;

      if (!targetListId) {
        const name = listName.trim() || "Quick list";
        if (newListType === "custom" && !customLabel.trim() && !name) {
          Alert.alert("Custom label required", "Enter a label for your custom list.");
          setSaving(false);
          return;
        }
        const body: Record<string, string> = { name, type: newListType };
        if (newListType === "custom") {
          body.custom_label = customLabel.trim() || name || "Custom";
        }
        const res = await api.post("/lists", body);
        targetListId = res.data.id;
        targetType = res.data.type;
      }

      for (const item of selected) {
        const body: Record<string, string> = { text: item.text.trim() };
        if (targetType === "grocery" && item.qty.trim()) body.qty = item.qty.trim();
        await api.post(`/lists/${targetListId}/items`, body);
      }

      setReviewOpen(false);
      reset();
      onComplete?.();

      if (!listId && targetListId) {
        router.push(`/list/${targetListId}`);
      }
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Could not save items.");
    } finally {
      setSaving(false);
    }
  };

  const openInput = useCallback(() => {
    reset();
    setInputOpen(true);
  }, [listType]);

  return (
    <>
      <Pressable
        testID="nl-list-btn"
        onPress={openInput}
        style={[styles.btn, compact && styles.btnCompact]}
      >
        <Feather name="message-square" size={compact ? 18 : 20} color={compact ? colors.brand : colors.onBrandPrimary} />
        {!compact && <Text style={styles.btnText}>Quick add</Text>}
      </Pressable>

      <SwipeableSheet visible={inputOpen} onClose={() => setInputOpen(false)}>
        <Text style={styles.sheetTitle}>Describe your list</Text>
        <Text style={styles.sheetSub}>
          e.g. &quot;milk, eggs, bread for groceries&quot; or &quot;call plumber, fix leaky faucet for weekend chores&quot;
        </Text>
        <TextInput
          testID="nl-list-input"
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type or paste items…"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.textArea}
          multiline
          autoFocus
        />
        <Pressable
          testID="nl-list-parse-btn"
          onPress={parse}
          disabled={parsing}
          style={[styles.primary, parsing && { opacity: 0.6 }]}
        >
          {parsing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Parse with AI</Text>
          )}
        </Pressable>
      </SwipeableSheet>

      <SwipeableSheet visible={reviewOpen} onClose={() => setReviewOpen(false)}>
        <Text style={styles.sheetTitle}>Review items</Text>
        <Text style={styles.sheetSub}>
          {usedAI ? "Parsed with AI" : "Parsed with basic rules (AI unavailable)"}
        </Text>

        {!listId && (
          <>
            <TextInput
              value={listName}
              onChangeText={setListName}
              placeholder="List name"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
            />
            <View style={styles.typeRow}>
              {BUILT_IN_TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setNewListType(t)}
                  style={[styles.typePill, newListType === t && styles.typePillOn]}
                >
                  <Text style={[styles.typePillText, newListType === t && styles.typePillTextOn]}>
                    {listTypeLabel(t)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setNewListType("custom")}
                style={[styles.typePill, newListType === "custom" && styles.typePillOn]}
              >
                <Text style={[styles.typePillText, newListType === "custom" && styles.typePillTextOn]}>Custom</Text>
              </Pressable>
            </View>
            {newListType === "custom" && (
              <TextInput
                value={customLabel}
                onChangeText={setCustomLabel}
                placeholder="Label e.g. Travel, Books"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.input}
              />
            )}
          </>
        )}

        <View style={styles.itemsBlock}>
          {items.map((item) => (
            <Pressable key={item.id} onPress={() => toggleItem(item.id)} style={styles.itemRow}>
              <View style={[styles.checkbox, item.selected && styles.checkboxOn]}>
                {item.selected && <Feather name="check" size={12} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemText}>{item.text}</Text>
                {item.qty ? <Text style={styles.itemQty}>{item.qty}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable
          testID="nl-list-save-btn"
          onPress={save}
          disabled={saving}
          style={[styles.primary, saving && { opacity: 0.6 }]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>
              {listId ? "Add to list" : "Create list & add items"}
            </Text>
          )}
        </Pressable>
      </SwipeableSheet>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    minHeight: 44,
    justifyContent: "center",
  },
  btnCompact: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    width: 44,
    height: 44,
    paddingHorizontal: 0,
  },
  btnText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onBrandPrimary },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  sheetSub: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  textArea: {
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 120,
    textAlignVertical: "top",
  },
  input: {
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  typeRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  typePill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typePillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  typePillText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  typePillTextOn: { color: "#fff" },
  itemsBlock: { gap: spacing.sm },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  itemText: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  itemQty: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  primary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center" },
  primaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
});
