import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";
import { DocumentScanButton } from "@/src/components/DocumentScanButton";
import { NaturalLanguageListButton } from "@/src/components/NaturalLanguageListButton";
import { BUILT_IN_TYPES, listTypeIcon, listTypeLabel, type ListType } from "@/src/utils/listTypes";

type TandemList = {
  id: string;
  name: string;
  type: ListType;
  custom_label?: string | null;
  item_count: number;
  done_count: number;
  shared_with: string[];
  owner_id: string;
};

const FILTERS: { key: ListType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "todo", label: "To-do" },
  { key: "grocery", label: "Grocery" },
  { key: "chores", label: "Chores" },
  { key: "custom", label: "Custom" },
];

export default function ListsHub() {
  const router = useRouter();
  const [lists, setLists] = useState<TandemList[]>([]);
  const [filter, setFilter] = useState<ListType | "all">("all");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ListType>("todo");
  const [customLabel, setCustomLabel] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/lists");
      setLists(res.data || []);
    } catch {/* ignore */}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = filter === "all" ? lists : lists.filter((l) => l.type === filter);

  const onCreate = async () => {
    if (!newName.trim()) return;
    if (newType === "custom" && !customLabel.trim()) return;
    try {
      const body: Record<string, string | boolean> = { name: newName.trim(), type: newType };
      if (newType === "custom") body.custom_label = customLabel.trim();
      const res = await api.post("/lists", body);
      setLists((prev) => [res.data, ...prev]);
      setCreating(false);
      setNewName("");
      setCustomLabel("");
      setNewType("todo");
      router.push(`/list/${res.data.id}`);
    } catch {/* ignore */}
  };

  return (
    <View style={styles.root} testID="lists-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Lists</Text>
            <Text style={styles.subhead}>Everything you're keeping together.</Text>
          </View>
          <View style={styles.headerActions}>
            <NaturalLanguageListButton onComplete={load} compact />
            <DocumentScanButton onComplete={load} compact />
            <Pressable
              testID="new-list-btn"
              onPress={() => setCreating(true)}
              style={styles.headerCta}
            >
              <Feather name="plus" size={20} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                testID={`filter-chip-${f.key}`}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={28} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyTitle}>No lists yet</Text>
            <Text style={styles.emptyHint}>Tap + to start a list — to-do, grocery, chores, or your own custom label.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((lst) => {
              const pct = lst.item_count > 0 ? lst.done_count / lst.item_count : 0;
              const typeLabel = listTypeLabel(lst.type, lst.custom_label);
              const icon = listTypeIcon(lst.type);
              return (
                <Pressable
                  key={lst.id}
                  testID={`list-card-${lst.id}`}
                  onPress={() => router.push(`/list/${lst.id}`)}
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.cardHead}>
                    <Feather name={icon} size={18} color={colors.brand} />
                    <Text style={styles.cardType}>{typeLabel}</Text>
                  </View>
                  <Text style={styles.cardName} numberOfLines={2}>{lst.name}</Text>
                  <View style={styles.cardFoot}>
                    <Text style={styles.cardCount}>
                      {lst.done_count}/{lst.item_count} done
                    </Text>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
                    </View>
                    {lst.shared_with.length > 0 && (
                      <View style={styles.sharedDot}>
                        <Feather name="users" size={12} color={colors.brand} />
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      <SwipeableSheet visible={creating} onClose={() => setCreating(false)}>
        <Text style={styles.sheetTitle}>New list</Text>
        <TextInput
          testID="new-list-name-input"
          value={newName}
          onChangeText={setNewName}
          placeholder="e.g. Weekend groceries"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.sheetInput}
          autoFocus
        />
        <View style={styles.typeRow}>
          {BUILT_IN_TYPES.map((t) => {
            const active = newType === t;
            return (
              <Pressable
                key={t}
                testID={`type-${t}`}
                onPress={() => setNewType(t)}
                style={[styles.typePill, active && styles.typePillOn]}
              >
                <Feather name={listTypeIcon(t)} size={14} color={active ? "#fff" : colors.onSurface} />
                <Text style={[styles.typePillText, active && { color: "#fff" }]}>
                  {listTypeLabel(t)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            testID="type-custom"
            onPress={() => setNewType("custom")}
            style={[styles.typePill, newType === "custom" && styles.typePillOn]}
          >
            <Feather name="folder" size={14} color={newType === "custom" ? "#fff" : colors.onSurface} />
            <Text style={[styles.typePillText, newType === "custom" && { color: "#fff" }]}>Custom</Text>
          </Pressable>
        </View>
        {newType === "custom" && (
          <TextInput
            testID="custom-label-input"
            value={customLabel}
            onChangeText={setCustomLabel}
            placeholder="Label e.g. Travel, Books, Ideas"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.sheetInput}
          />
        )}
        <Pressable testID="new-list-create-btn" onPress={onCreate} style={styles.sheetPrimary}>
          <Text style={styles.sheetPrimaryText}>Create list</Text>
        </Pressable>
      </SwipeableSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heading: { fontFamily: fonts.display, fontSize: fontSize.xxxl, color: colors.onSurface },
  subhead: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  headerCta: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  chipsScroll: { marginTop: spacing.lg, height: 40 },
  chipsRow: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: {
    height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center",
    flexShrink: 0, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onSurfaceInverse },
  scroll: { padding: spacing.xl, gap: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: {
    width: "48%",
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface,
    minHeight: 140, justifyContent: "space-between",
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  cardType: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.brand, letterSpacing: 0.5, textTransform: "uppercase" },
  cardName: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface, lineHeight: 24 },
  cardFoot: { gap: spacing.xs },
  cardCount: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  progressTrack: { height: 3, backgroundColor: colors.surfaceTertiary, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brand },
  sharedDot: { position: "absolute", top: -36, right: 0 },
  empty: { padding: spacing.xxxl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  emptyHint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,25,23,0.4)" },
  sheet: {
    backgroundColor: colors.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.md,
    paddingBottom: spacing.xxl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    gap: spacing.lg,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.borderStrong, borderRadius: 2, alignSelf: "center" },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  sheetInput: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, paddingVertical: spacing.md },
  typeRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  typePill: {
    flexDirection: "row", gap: spacing.xs,
    paddingHorizontal: spacing.lg, height: 40, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, alignItems: "center",
  },
  typePillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  typePillText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onSurface },
  sheetPrimary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center" },
  sheetPrimaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
});
