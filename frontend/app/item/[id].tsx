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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { formatDue } from "@/src/components/ReminderPicker";
import { confirmDelete } from "@/src/utils/confirmDelete";

type ItemDetail = {
  id: string;
  list_id: string;
  list_name?: string;
  list_type?: string;
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

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/items/${id}`);
      setItem(res.data);
    } catch {
      setItem(null);
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

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{item.list_name || "List item"}</Text>
          <Text style={styles.title} numberOfLines={2}>{item.text}</Text>
        </View>
        <Pressable onPress={() => router.push(`/list/${item.list_id}?editItem=${item.id}`)} hitSlop={10}>
          <Feather name="edit-2" size={20} color={colors.brand} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={10}>
          <Feather name="trash-2" size={20} color={colors.error} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.body}>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, gap: spacing.md },
  header: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", gap: spacing.md, alignItems: "center",
  },
  kicker: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.brand, textTransform: "uppercase", letterSpacing: 0.8 },
  title: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface, marginTop: 2 },
  body: { padding: spacing.xl, gap: spacing.lg },
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
  muted: { fontFamily: fonts.body, color: colors.onSurfaceSecondary },
  link: { fontFamily: fonts.bodyMedium, color: colors.brand },
});
