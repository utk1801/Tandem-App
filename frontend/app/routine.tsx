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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";

type Step = { id: string; text: string; order: number };

export default function RoutineEditor() {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>([]);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/routine");
      setSteps(res.data.steps || []);
    } catch {/* ignore */}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async (next: Step[]) => {
    setSteps(next);
    try {
      await api.put("/routine", { steps: next });
    } catch {/* ignore */}
  };

  const add = () => {
    if (!text.trim()) return;
    const newStep: Step = { id: `${Date.now()}`, text: text.trim(), order: steps.length };
    save([...steps, newStep]);
    setText("");
  };

  const remove = (id: string) => save(steps.filter((s) => s.id !== id));
  const move = (id: string, dir: -1 | 1) => {
    const idx = steps.findIndex((s) => s.id === id);
    const ni = idx + dir;
    if (idx < 0 || ni < 0 || ni >= steps.length) return;
    const copy = steps.slice();
    [copy[idx], copy[ni]] = [copy[ni], copy[idx]];
    save(copy);
  };

  return (
    <View style={styles.root} testID="routine-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="back-btn">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Morning ritual</Text>
          <Text style={styles.title}>Your routine</Text>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={steps}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.hint}>
              Add small, intentional steps. They'll show on your Today screen each morning.
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Feather name="sunrise" size={28} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyTitle}>No steps yet</Text>
              <Text style={styles.emptyHint}>Try: stretch, hydrate, three deep breaths.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.row} testID={`routine-edit-${item.id}`}>
              <Text style={styles.rowNumber}>{index + 1}</Text>
              <Text style={styles.rowText} numberOfLines={2}>{item.text}</Text>
              <Pressable onPress={() => move(item.id, -1)} hitSlop={8}>
                <Feather name="chevron-up" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
              <Pressable onPress={() => move(item.id, 1)} hitSlop={8}>
                <Feather name="chevron-down" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
              <Pressable testID={`remove-step-${item.id}`} onPress={() => remove(item.id)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.error} />
              </Pressable>
            </View>
          )}
        />

        <View style={styles.composer}>
          <TextInput
            testID="new-step-input"
            value={text}
            onChangeText={setText}
            placeholder="Add a step…"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
            onSubmitEditing={add}
            returnKeyType="send"
          />
          <Pressable testID="add-step-btn" onPress={add} style={styles.addBtn}>
            <Feather name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: colors.surface },
  kicker: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.brand, letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface, marginTop: 2 },
  list: { padding: spacing.xl, gap: spacing.sm },
  hint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginBottom: spacing.md, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  rowNumber: { fontFamily: fonts.display, fontSize: fontSize.lg, color: colors.brand, width: 20 },
  rowText: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  emptyBlock: { padding: spacing.xxxl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  emptyHint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, height: 44 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
