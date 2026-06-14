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
import { confirmDelete } from "@/src/utils/confirmDelete";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";
import { MarkdownContent } from "@/src/components/MarkdownContent";
import { MarkdownEditor } from "@/src/components/MarkdownEditor";

const MOODS = ["calm", "happy", "tired", "anxious", "grateful", "reflective"];

type Entry = { id: string; title: string; body: string; mood?: string; created_at: string; owner_id: string; owner_username: string; shared: boolean };

export default function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<string | undefined>();
  const [share, setShare] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/journal/${id}`);
      setEntry(res.data);
    } catch {
      setEntry(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = () => {
    if (!entry) return;
    setTitle(entry.title);
    setBody(entry.body);
    setMood(entry.mood);
    setShare(!!entry.shared);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!entry) return;
    const res = await api.patch(`/journal/${entry.id}`, {
      title: title.trim(),
      body: body.trim(),
      mood,
      share_with_partner: share,
    });
    setEntry(res.data);
    setEditing(false);
  };

  const onDelete = () => {
    if (!entry) return;
    confirmDelete("Delete entry?", "This cannot be undone.", async () => {
      await api.delete(`/journal/${entry.id}`);
      router.back();
    });
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (!entry) return <SafeAreaView style={styles.center}><Text style={styles.muted}>Not found.</Text></SafeAreaView>;

  const canEdit = entry.owner_id === user?.id;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{entry.title}</Text>
        {canEdit && (
          <>
            <Pressable onPress={openEdit} hitSlop={10}><Feather name="edit-2" size={20} color={colors.brand} /></Pressable>
            <Pressable onPress={onDelete} hitSlop={10}><Feather name="trash-2" size={20} color={colors.error} /></Pressable>
          </>
        )}
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.date}>
          {new Date(entry.created_at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          {entry.mood ? ` · ${entry.mood}` : ""}
        </Text>
        <MarkdownContent content={entry.body} />
        <Text style={styles.meta}>
          {entry.owner_id === user?.id ? "You" : entry.owner_username}
          {entry.shared ? " · shared" : ""}
        </Text>
      </ScrollView>

      <SwipeableSheet visible={editing} onClose={() => setEditing(false)}>
        <Text style={styles.sheetTitle}>Edit entry</Text>
        <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Title" placeholderTextColor={colors.onSurfaceTertiary} />
        <MarkdownEditor
          value={body}
          onChange={setBody}
          placeholder="Body — markdown supported."
          minHeight={140}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", gap: spacing.md, alignItems: "center" },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  body: { padding: spacing.xl, gap: spacing.lg },
  date: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  meta: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  muted: { fontFamily: fonts.body, color: colors.onSurfaceSecondary },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,25,23,0.4)" },
  sheet: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "90%", gap: spacing.md },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface, marginBottom: spacing.sm },
  input: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, textAlignVertical: "top" },
  moodChip: { paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  moodChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  moodText: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  shareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: spacing.sm },
  primary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm },
  primaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
});
