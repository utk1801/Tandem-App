import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/contexts/AuthContext";
import type { CalendarEntry, EventItem, ProfileDates } from "@/src/types/calendar";
import { buildCalendarEntries, parseYmd, startOfDay } from "@/src/utils/calendar";

const HERO = "https://images.unsplash.com/photo-1708465034183-7e3528d41944?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTN8MHwxfHNlYXJjaHwxfHx3YXJtJTI0bW9ybmluZyUyMHN1bmxpZ2h0JTIwc29mdCUyMGFic3RyYWN0JTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODEzMjMyNzl8MA&ixlib=rb-4.1.0&q=85";

type Quote = { text: string; author: string };
type Routine = { steps: { id: string; text: string; order: number }[]; completed_today: string[] };

export default function Today() {
  const { user } = useAuth();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [upcoming, setUpcoming] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [q, r, meRes, evRes, connRes] = await Promise.all([
        api.get("/quote/today"),
        api.get("/routine"),
        api.get("/auth/me"),
        api.get("/events"),
        api.get("/connection"),
      ]);
      setQuote(q.data);
      setRoutine(r.data);
      const today = startOfDay(new Date());
      const horizon = new Date(today);
      horizon.setDate(today.getDate() + 14);
      const me = meRes.data;
      const profiles: ProfileDates[] = [{
        id: me.id,
        username: me.username,
        birthday: me.birthday,
        anniversary: me.anniversary,
      }];
      const partner = connRes.data?.partner;
      if (partner) {
        profiles.push({
          id: partner.id,
          username: partner.username,
          birthday: partner.birthday,
          anniversary: partner.anniversary,
        });
      }
      const entries = buildCalendarEntries(evRes.data || [], profiles, today, horizon);
      setUpcoming(entries.slice(0, 6));
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = new Date().toISOString().slice(0, 10);
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const toggleStep = async (stepId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const isDone = routine?.completed_today.includes(stepId);
    // optimistic
    setRoutine((r) => r ? {
      ...r,
      completed_today: isDone
        ? r.completed_today.filter((x) => x !== stepId)
        : [...r.completed_today, stepId],
    } : r);
    try {
      await api.post("/routine/check", { step_id: stepId, date: today });
    } catch {
      load();
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.brand}
          />
        }
        showsVerticalScrollIndicator={false}
        testID="today-screen"
      >
        {/* Hero quote card */}
        <View style={styles.hero}>
          <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(44,40,37,0.1)", "rgba(44,40,37,0.88)"]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["top"]} style={styles.heroSafe}>
            <Text style={styles.greeting}>{greeting}, {user?.username}.</Text>
          </SafeAreaView>
          <View style={styles.heroQuote}>
            {loading && !quote ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.quoteText} testID="daily-quote-text">
                  {quote?.text || "Begin gently."}
                </Text>
                <Text style={styles.quoteAuthor}>— {quote?.author || "Tandem"}</Text>
              </>
            )}
          </View>
        </View>

        {/* Morning routine */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Morning routine</Text>
            <Pressable
              testID="edit-routine-btn"
              onPress={() => router.push("/routine")}
              hitSlop={10}
            >
              <Feather name="edit-3" size={18} color={colors.brand} />
            </Pressable>
          </View>

          {routine && routine.steps.length === 0 ? (
            <Pressable
              testID="create-routine-cta"
              style={styles.emptyRoutine}
              onPress={() => router.push("/routine")}
            >
              <Feather name="sunrise" size={22} color={colors.brand} />
              <Text style={styles.emptyTitle}>Create your morning ritual</Text>
              <Text style={styles.emptyHint}>A few small steps to start your day with intention.</Text>
            </Pressable>
          ) : (
            <View style={styles.routineList}>
              {routine?.steps.map((s) => {
                const done = routine.completed_today.includes(s.id);
                return (
                  <Pressable
                    key={s.id}
                    testID={`routine-step-${s.id}`}
                    onPress={() => toggleStep(s.id)}
                    style={({ pressed }) => [styles.routineRow, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[styles.checkbox, done && styles.checkboxOn]}>
                      {done && <Feather name="check" size={14} color="#fff" />}
                    </View>
                    <Text style={[styles.routineText, done && styles.routineTextDone]}>
                      {s.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Upcoming events */}
        {upcoming.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Coming up</Text>
              <Pressable
                testID="open-calendar-btn"
                onPress={() => router.push("/(tabs)/calendar")}
                hitSlop={10}
              >
                <Feather name="arrow-right" size={18} color={colors.brand} />
              </Pressable>
            </View>
            <View style={styles.upcomingList}>
              {upcoming.map((ev) => {
                const d = parseYmd(ev.date);
                const today = startOfDay(new Date());
                const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
                const when = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                const icon = ev.kind === "birthday" ? "gift" : ev.kind === "anniversary" ? "heart" : null;
                return (
                  <Pressable
                    key={ev.id}
                    testID={`upcoming-${ev.id}`}
                    onPress={() => router.push(ev.kind === "event" && ev.source_id ? `/event/${ev.source_id}` : "/(tabs)/calendar")}
                    style={[styles.upcomingCard, ev.is_special && styles.upcomingCardSpecial]}
                  >
                    <View style={styles.upcomingDateCol}>
                      <Text style={styles.upcomingWhen}>{when}</Text>
                      {ev.time && <Text style={styles.upcomingTime}>{ev.time}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                        {icon && <Feather name={icon as any} size={14} color={colors.brand} />}
                        <Text style={styles.upcomingTitle} numberOfLines={1}>{ev.title}</Text>
                      </View>
                      {(ev.location || ev.owner_id !== user?.id) && (
                        <Text style={styles.upcomingMeta} numberOfLines={1}>
                          {ev.location}
                          {ev.location && ev.owner_id !== user?.id && " · "}
                          {ev.owner_id !== user?.id && `by ${ev.owner_username}`}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingBottom: spacing.xl },
  hero: {
    height: 380,
    backgroundColor: colors.surfaceInverse,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  heroSafe: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  greeting: { fontFamily: fonts.body, fontSize: fontSize.base, color: "rgba(253,252,249,0.85)" },
  heroQuote: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  quoteText: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: "#FDFCF9",
  },
  quoteAuthor: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: "rgba(253,252,249,0.75)",
    letterSpacing: 0.5,
  },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.lg },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: fontSize.xxl,
    color: colors.onSurface,
  },
  emptyRoutine: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  emptyHint: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, lineHeight: 20 },
  routineList: { gap: spacing.sm },
  routineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  routineText: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  routineTextDone: { color: colors.onSurfaceTertiary, textDecorationLine: "line-through" },
  upcomingList: { gap: spacing.sm },
  upcomingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  upcomingCardSpecial: { borderColor: colors.brandTertiary, backgroundColor: colors.brandTertiary },
  upcomingDateCol: { width: 90 },
  upcomingWhen: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.brand, letterSpacing: 0.3, textTransform: "uppercase" },
  upcomingTime: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  upcomingTitle: { fontFamily: fonts.display, fontSize: fontSize.lg, color: colors.onSurface },
  upcomingMeta: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
});
