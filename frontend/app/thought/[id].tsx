import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Switch,
} from "react-native";

const MOODS = ["calm", "happy", "tired", "anxious", "grateful", "reflective"];
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { spacing, radius, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { confirmDelete } from "@/src/utils/confirmDelete";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";
import { MarkdownContent } from "@/src/components/MarkdownContent";
import { MarkdownEditor } from "@/src/components/MarkdownEditor";

type Thought = { id: string; text: string; mood?: string; created_at: string; owner_id: string; owner_username: string; shared: boolean };

export default function ThoughtDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [thought, setThought] = useState<Thought | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [mood, setMood] = useState<string | undefined>();
  const [share, setShare] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/thoughts/${id}`);
      setThought(res.data);
    } catch {
      setThought(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = () => {
    if (!thought) return;
    setText(thought.text);
    setMood(thought.mood);
    setShare(!!thought.shared);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!thought || !text.trim()) return;
    const res = await api.patch(`/thoughts/${thought.id}`, { text: text.trim(), mood: mood ?? null, share_with_partner: share });
    setThought(res.data);
    setEditing(false);
  };

  const onDelete = () => {
    if (!thought) return;
    confirmDelete("Delete thought?", "This cannot be undone.", async () => {
      await api.delete(`/thoughts/${thought.id}`);
      router.back();
    });
  };

  const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", gap: spacing.md, alignItems: "center" },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  body: { padding: spacing.xl, gap: spacing.lg },
  meta: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  muted: { fontFamily: fonts.body, color: colors.onSurfaceSecondary },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  shareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  primary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center" },
  primaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
  moodChip: { paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  moodChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  moodText: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
});

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (!thought) return <SafeAreaView style={styles.center}><Text style={styles.muted}>Not found.</Text></SafeAreaView>;

  const canEdit = thought.owner_id === user?.id;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Thought</Text>
        {canEdit && (
          <>
            <Pressable onPress={openEdit} hitSlop={10}><Feather name="edit-2" size={20} color={colors.brand} /></Pressable>
            <Pressable onPress={onDelete} hitSlop={10}><Feather name="trash-2" size={20} color={colors.error} /></Pressable>
          </>
        )}
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.body}>
        <MarkdownContent content={thought.text} />
        <Text style={styles.meta}>
          {thought.owner_id === user?.id ? "You" : thought.owner_username}
          {thought.mood ? ` · ${thought.mood}` : ""}
          {thought.shared ? " · shared" : ""} · {new Date(thought.created_at).toLocaleString()}
        </Text>
      </ScrollView>

      <SwipeableSheet visible={editing} onClose={() => setEditing(false)}>
        <Text style={styles.sheetTitle}>Edit thought</Text>
        <MarkdownEditor
          value={text}
          onChange={setText}
          placeholder="What's on your mind? Markdown supported."
          minHeight={120}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {MOODS.map((m) => (
            <Pressable key={m} onPress={() => setMood(mood === m ? undefined : m)} style={[styles.moodChip, mood === m && styles.moodChipOn]}>
              <Text style={[styles.moodText, mood === m && { color: "#fff" }]}>{m}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {user?.partner_id && (
          <View style={styles.shareRow}>
            <Text style={styles.meta}>Share with partner</Text>
            <Switch value={share} onValueChange={setShare} trackColor={{ true: colors.brand, false: colors.borderStrong }} thumbColor="#fff" />
          </View>
        )}
        <Pressable onPress={saveEdit} style={styles.primary}><Text style={styles.primaryText}>Save</Text></Pressable>
      </SwipeableSheet>
    </View>
  );
}
