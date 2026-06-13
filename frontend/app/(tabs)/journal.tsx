import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/contexts/AuthContext";

type Thought = { id: string; text: string; created_at: string; owner_id: string; owner_username: string; shared: boolean };
type JournalEntry = { id: string; title: string; body: string; mood?: string; created_at: string; owner_id: string; owner_username: string; shared: boolean };

const MOODS = ["calm", "happy", "tired", "anxious", "grateful", "reflective"];

export default function JournalScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"thoughts" | "journal">("thoughts");
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState<string | undefined>();
  const [share, setShare] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, j] = await Promise.all([api.get("/thoughts"), api.get("/journal")]);
      setThoughts(t.data || []);
      setEntries(j.data || []);
    } catch {/* ignore */}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => { setCreating(true); setText(""); setTitle(""); setMood(undefined); setShare(false); };

  const submit = async () => {
    if (tab === "thoughts") {
      if (!text.trim()) return;
      const res = await api.post("/thoughts", { text: text.trim(), share_with_partner: share });
      setThoughts((p) => [res.data, ...p]);
    } else {
      if (!title.trim() && !text.trim()) return;
      const res = await api.post("/journal", { title: title.trim(), body: text.trim(), mood, share_with_partner: share });
      setEntries((p) => [res.data, ...p]);
    }
    setCreating(false);
  };

  return (
    <View style={styles.root} testID="journal-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Journal</Text>
            <Text style={styles.subhead}>Thoughts and reflections, side by side.</Text>
          </View>
          <Pressable
            testID="new-entry-btn"
            onPress={openNew}
            style={styles.headerCta}
          >
            <Feather name="plus" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
        <View style={styles.segment}>
          <Pressable
            testID="seg-thoughts"
            onPress={() => setTab("thoughts")}
            style={[styles.segItem, tab === "thoughts" && styles.segItemOn]}
          >
            <Text style={[styles.segText, tab === "thoughts" && styles.segTextOn]}>Thoughts</Text>
          </Pressable>
          <Pressable
            testID="seg-journal"
            onPress={() => setTab("journal")}
            style={[styles.segItem, tab === "journal" && styles.segItemOn]}
          >
            <Text style={[styles.segText, tab === "journal" && styles.segTextOn]}>Journal</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === "thoughts" ? (
          thoughts.length === 0 ? (
            <Empty title="A blank page" hint="Capture a fleeting thought before it slips away." />
          ) : (
            <View style={styles.thoughtsGrid}>
              {thoughts.map((t) => (
                <View key={t.id} testID={`thought-${t.id}`} style={styles.thoughtCard}>
                  <Text style={styles.thoughtText}>{t.text}</Text>
                  <View style={styles.thoughtMeta}>
                    <Text style={styles.metaSmall}>
                      {t.owner_id === user?.id ? "you" : t.owner_username}
                      {t.shared && " · shared"}
                    </Text>
                    <Text style={styles.metaSmall}>{new Date(t.created_at).toLocaleDateString()}</Text>
                  </View>
                </View>
              ))}
            </View>
          )
        ) : entries.length === 0 ? (
          <Empty title="Your story begins here" hint="Write your first entry — long, short, anything." />
        ) : (
          <View style={styles.journalList}>
            {entries.map((e) => (
              <View key={e.id} testID={`journal-${e.id}`} style={styles.journalCard}>
                <Text style={styles.journalDate}>
                  {new Date(e.created_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  {e.mood && `  ·  ${e.mood}`}
                  {e.owner_id !== user?.id && `  ·  ${e.owner_username}`}
                  {e.shared && e.owner_id === user?.id && `  ·  shared`}
                </Text>
                <Text style={styles.journalTitle}>{e.title}</Text>
                <Text style={styles.journalBody} numberOfLines={5}>{e.body}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      <Modal visible={creating} transparent animationType="slide" onRequestClose={() => setCreating(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setCreating(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{tab === "thoughts" ? "New thought" : "New journal entry"}</Text>
            {tab === "journal" && (
              <TextInput
                testID="entry-title-input"
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.sheetTitleInput}
              />
            )}
            <TextInput
              testID="entry-body-input"
              value={text}
              onChangeText={setText}
              placeholder={tab === "thoughts" ? "What's on your mind?" : "Write freely…"}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={[styles.sheetInput, tab === "journal" && { minHeight: 140 }]}
              multiline
              autoFocus
            />
            {tab === "journal" && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {MOODS.map((m) => (
                  <Pressable
                    key={m}
                    testID={`mood-${m}`}
                    onPress={() => setMood(mood === m ? undefined : m)}
                    style={[styles.moodChip, mood === m && styles.moodChipOn]}
                  >
                    <Text style={[styles.moodText, mood === m && { color: "#fff" }]}>{m}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {user?.partner_id && (
              <View style={styles.shareRow}>
                <Text style={styles.shareLabel}>Share with partner</Text>
                <Switch
                  testID="share-switch"
                  value={share}
                  onValueChange={setShare}
                  trackColor={{ true: colors.brand, false: colors.borderStrong }}
                  thumbColor="#fff"
                />
              </View>
            )}
            <Pressable testID="entry-save-btn" onPress={submit} style={styles.sheetPrimary}>
              <Text style={styles.sheetPrimaryText}>Save</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={styles.empty}>
      <Feather name="edit-3" size={28} color={colors.onSurfaceTertiary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontFamily: fonts.display, fontSize: fontSize.xxxl, color: colors.onSurface },
  subhead: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  headerCta: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", marginTop: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: "center" },
  segItemOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  segTextOn: { color: colors.onSurface },
  scroll: { padding: spacing.xl, gap: spacing.md },
  thoughtsGrid: { gap: spacing.md },
  thoughtCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, gap: spacing.sm },
  thoughtText: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, lineHeight: 22 },
  thoughtMeta: { flexDirection: "row", justifyContent: "space-between" },
  metaSmall: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, letterSpacing: 0.3 },
  journalList: { gap: spacing.lg },
  journalCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm, backgroundColor: colors.surface },
  journalDate: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  journalTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface, lineHeight: 28 },
  journalBody: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurfaceSecondary, lineHeight: 22 },
  empty: { padding: spacing.xxxl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  emptyHint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,25,23,0.4)" },
  sheet: { backgroundColor: colors.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.borderStrong, borderRadius: 2, alignSelf: "center" },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  sheetTitleInput: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, paddingVertical: spacing.sm },
  sheetInput: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 80, textAlignVertical: "top" },
  moodChip: { paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  moodChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  moodText: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  shareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.xs },
  shareLabel: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  sheetPrimary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm },
  sheetPrimaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
});
