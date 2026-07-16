import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  Linking,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { spacing, radius, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/contexts/ThemeContext";
import { api } from "@/src/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { formatDue } from "@/src/components/ReminderPicker";
import { confirmDelete } from "@/src/utils/confirmDelete";
import { listTypeLabel } from "@/src/utils/listTypes";

type ItemDetail = {
  id: string;
  list_id: string;
  list_name?: string;
  list_type?: string;
  list_custom_label?: string | null;
  text: string;
  qty?: string | null;
  done: boolean;
  due_at?: string | null;
  remind_minutes_before?: number | null;
  kind?: string | null;
  url?: string | null;
  media_uri?: string | null;
  created_by: string;
};

type Comment = {
  id: string;
  item_id: string;
  author_id: string;
  author_username: string;
  body: string;
  created_at: string;
};

export default function ItemDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [itemRes, commentsRes] = await Promise.all([
        api.get(`/items/${id}`),
        api.get(`/items/${id}/comments`),
      ]);
      setItem(itemRes.data);
      setComments(commentsRes.data || []);
    } catch {
      setItem(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onDelete = () => {
    if (!item) return;
    confirmDelete("Delete item?", "This will remove it from the list.", async () => {
      await api.delete(`/items/${item.id}`);
      router.back();
    });
  };

  const postComment = async () => {
    if (!item || !commentText.trim() || posting) return;
    setPosting(true);
    try {
      const res = await api.post(`/items/${item.id}/comments`, { body: commentText.trim() });
      setComments((prev) => [...prev, res.data]);
      setCommentText("");
    } catch {
      /* ignore */
    } finally {
      setPosting(false);
    }
  };

  const deleteComment = (comment: Comment) => {
    confirmDelete("Delete comment?", "This cannot be undone.", async () => {
      await api.delete(`/comments/${comment.id}`);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    });
  };

  const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, gap: spacing.md },
  header: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", gap: spacing.md, alignItems: "center",
  },
  kicker: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.brand, textTransform: "uppercase", letterSpacing: 0.8 },
  title: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface, marginBottom: spacing.sm },
  body: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  badge: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onBrandPrimary, backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, overflow: "hidden", textTransform: "capitalize" },
  badgeDone: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.success, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  meta: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  block: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md },
  blockText: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  linkCard: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "flex-start" },
  linkText: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.base, color: colors.brand },
  image: { width: "100%", height: 240, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary },
  secondaryBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  secondaryBtnText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: colors.onSurface },
  commentsSection: { gap: spacing.md, marginTop: spacing.md },
  sectionTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  commentRow: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "flex-start" },
  commentMeta: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginBottom: 4 },
  commentBody: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface },
  commentComposer: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.md,
  },
  commentInput: {
    flex: 1, minHeight: 44, maxHeight: 100,
    fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  commentSend: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  muted: { fontFamily: fonts.body, color: colors.onSurfaceSecondary },
  link: { fontFamily: fonts.bodyMedium, color: colors.brand },
});

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }
  if (!item) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>Item not found.</Text>
        <Pressable onPress={() => router.back()}><Text style={styles.link}>Go back</Text></Pressable>
      </SafeAreaView>
    );
  }

  const due = formatDue(item.due_at ?? null);
  const kind = item.kind || "text";
  const listLabel = item.list_type
    ? listTypeLabel(item.list_type, item.list_custom_label)
    : (item.list_name || "List item");

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.kicker}>{listLabel}</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.push(`/list/${item.list_id}?editItem=${item.id}`)} hitSlop={10}>
          <Feather name="edit-2" size={20} color={colors.brand} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={10}>
          <Feather name="trash-2" size={20} color={colors.error} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{item.text}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.badge}>{kind}</Text>
          {item.done && <Text style={styles.badgeDone}>Done</Text>}
          {item.qty && <Text style={styles.meta}>Qty: {item.qty}</Text>}
        </View>
        {due && (
          <View style={styles.block}>
            <Feather name="clock" size={16} color={colors.brand} />
            <Text style={styles.blockText}>{due}</Text>
          </View>
        )}
        {(kind === "link" || kind === "video") && item.url && (
          <Pressable style={styles.linkCard} onPress={() => Linking.openURL(item.url!)}>
            <Feather name={kind === "video" ? "play-circle" : "link"} size={20} color={colors.brand} />
            <Text style={styles.linkText} numberOfLines={3}>{item.url}</Text>
          </Pressable>
        )}
        {kind === "image" && item.media_uri && (
          <Image source={{ uri: item.media_uri }} style={styles.image} resizeMode="cover" />
        )}
        <Pressable style={styles.secondaryBtn} onPress={() => router.push(`/list/${item.list_id}`)}>
          <Text style={styles.secondaryBtnText}>Open list</Text>
        </Pressable>

        <View style={styles.commentsSection}>
          <Text style={styles.sectionTitle}>Comments</Text>
          {comments.length === 0 ? (
            <Text style={styles.muted}>No comments yet. Start the conversation.</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.commentMeta}>
                    {c.author_id === user?.id ? "You" : c.author_username}
                    {" · "}
                    {new Date(c.created_at).toLocaleString()}
                  </Text>
                  <Text style={styles.commentBody}>{c.body}</Text>
                </View>
                {c.author_id === user?.id && (
                  <Pressable onPress={() => deleteComment(c)} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={colors.onSurfaceTertiary} />
                  </Pressable>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.commentComposer}>
        <TextInput
          value={commentText}
          onChangeText={setCommentText}
          placeholder="Add a comment…"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.commentInput}
          multiline
        />
        <Pressable onPress={postComment} style={styles.commentSend} disabled={posting || !commentText.trim()}>
          {posting ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={18} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
