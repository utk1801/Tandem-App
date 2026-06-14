import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import {
  isDocumentScanSupported,
  parseDocumentImage,
  type DocumentScanResult,
} from "tandem-document-scan";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";
import { useRouter } from "expo-router";

type ListType = "todo" | "grocery" | "chores";

type ReviewItem = {
  id: string;
  text: string;
  qty: string;
  selected: boolean;
};

type Props = {
  listId?: string;
  listType?: ListType;
  onComplete?: () => void;
  compact?: boolean;
};

function inferListType(raw: string | null | undefined): ListType {
  if (raw === "grocery" || raw === "chores") return raw;
  return "todo";
}

export function DocumentScanButton({ listId, listType, onComplete, compact }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scanResult, setScanResult] = useState<DocumentScanResult | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [listName, setListName] = useState("");
  const [newListType, setNewListType] = useState<ListType>(listType || "todo");
  const [usedAI, setUsedAI] = useState(false);
  const [saving, setSaving] = useState(false);

  const onPress = useCallback(async () => {
    if (Platform.OS !== "ios") {
      Alert.alert("iOS only", "Document scanning is available on iOS devices.");
      return;
    }
    if (!isDocumentScanSupported()) {
      Alert.alert(
        "Development build required",
        "Document scanning uses Apple Vision and requires a native iOS build (expo run:ios), not Expo Go.",
      );
      return;
    }

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera access", "Allow camera access to scan documents.");
      return;
    }

    const photo = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (photo.canceled || !photo.assets[0]?.uri) return;

    setBusy(true);
    try {
      const result = await parseDocumentImage(photo.assets[0].uri);
      if (!result.items.length) {
        Alert.alert("No items found", "Try a clearer photo with readable text.");
        return;
      }
      setScanResult(result);
      setUsedAI(result.usedAI);
      setListName(result.listName?.trim() || (listId ? "" : "Scanned list"));
      setNewListType(listId ? (listType || "todo") : inferListType(result.listType));
      setItems(
        result.items.map((item, idx) => ({
          id: String(idx),
          text: item.text,
          qty: item.qty || "",
          selected: true,
        })),
      );
      setReviewOpen(true);
    } catch (e: any) {
      Alert.alert("Scan failed", e?.message || "Could not read the document.");
    } finally {
      setBusy(false);
    }
  }, [listId, listType]);

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
        const name = listName.trim() || "Scanned list";
        const res = await api.post("/lists", { name, type: newListType });
        targetListId = res.data.id;
        targetType = res.data.type;
      }

      for (const item of selected) {
        const body: Record<string, string> = { text: item.text.trim() };
        if (targetType === "grocery" && item.qty.trim()) body.qty = item.qty.trim();
        await api.post(`/lists/${targetListId}/items`, body);
      }

      setReviewOpen(false);
      setScanResult(null);
      onComplete?.();

      if (!listId && targetListId) {
        router.push(`/list/${targetListId}`);
      }
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Could not save scanned items.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Pressable
        testID="document-scan-btn"
        onPress={onPress}
        disabled={busy}
        style={[styles.btn, compact && styles.btnCompact, busy && { opacity: 0.6 }]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={compact ? colors.brand : colors.onBrandPrimary} />
        ) : (
          <Feather name="camera" size={compact ? 18 : 20} color={compact ? colors.brand : colors.onBrandPrimary} />
        )}
        {!compact && <Text style={styles.btnText}>Scan</Text>}
      </Pressable>

      <SwipeableSheet visible={reviewOpen} onClose={() => setReviewOpen(false)}>
        <Text style={styles.sheetTitle}>Review scanned items</Text>
        <Text style={styles.sheetSub}>
          {usedAI
            ? "Parsed with on-device Apple Intelligence"
            : "Parsed with Vision OCR (Apple Intelligence unavailable)"}
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
              {(["todo", "grocery", "chores"] as ListType[]).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setNewListType(t)}
                  style={[styles.typePill, newListType === t && styles.typePillOn]}
                >
                  <Text style={[styles.typePillText, newListType === t && styles.typePillTextOn]}>{t}</Text>
                </Pressable>
              ))}
            </View>
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

        {scanResult?.rawText ? (
          <Text style={styles.rawHint} numberOfLines={3}>
            OCR: {scanResult.rawText}
          </Text>
        ) : null}

        <Pressable
          testID="document-scan-save-btn"
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
  typePillText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, textTransform: "capitalize" },
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
  rawHint: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, lineHeight: 18 },
  primary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center" },
  primaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
});
