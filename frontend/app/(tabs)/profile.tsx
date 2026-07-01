import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Share,
} from "react-native";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { SwipeableSheet } from "@/src/components/SwipeableSheet";

const SPIRIT_ANIMALS: { emoji: string; name: string; trait: string }[] = [
  { emoji: "🦊", name: "Fox",      trait: "curious, loyal, slightly chaotic" },
  { emoji: "🐺", name: "Wolf",     trait: "protective, intense, a little dramatic" },
  { emoji: "🦋", name: "Butterfly", trait: "gentle, always evolving, impossible to pin down" },
  { emoji: "🐉", name: "Dragon",   trait: "ambitious, warm once trusted, secretly soft" },
  { emoji: "🦁", name: "Lion",     trait: "bold, generous, needs the spotlight sometimes" },
  { emoji: "🐢", name: "Turtle",   trait: "steady, deeply caring, slow to anger" },
  { emoji: "🦅", name: "Eagle",    trait: "visionary, independent, sees the whole picture" },
  { emoji: "🐬", name: "Dolphin",  trait: "playful, empathetic, keeps everyone laughing" },
  { emoji: "🦉", name: "Owl",      trait: "thoughtful, observant, awake when others sleep" },
  { emoji: "🐻", name: "Bear",     trait: "grounding, fiercely loyal, excellent at naps" },
  { emoji: "🦌", name: "Deer",     trait: "graceful, intuitive, quietly the most observant" },
  { emoji: "🐝", name: "Bee",      trait: "industrious, community-first, never wastes a moment" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function getSpiritAnimal(userId: string) {
  return SPIRIT_ANIMALS[hashString(userId) % SPIRIT_ANIMALS.length];
}

export default function Profile() {
  const router = useRouter();
  const { user, signOut, refreshUser } = useAuth();
  const [partner, setPartner] = useState<any>(null);
  const [spiritVisible, setSpiritVisible] = useState(false);
  const [stats, setStats] = useState<{
    lists_created: number;
    tasks_checked: number;
    thoughts_shared: number;
    journal_entries: number;
    routine_streak: number;
    days_using: number;
  } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [acceptVisible, setAcceptVisible] = useState(false);
  const [inviteHandle, setInviteHandle] = useState("");
  const [acceptCode, setAcceptCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [connRes, statsRes] = await Promise.all([
        api.get("/connection"),
        api.get("/stats"),
      ]);
      setPartner(connRes.data.partner);
      setStats(statsRes.data);
    } catch {/* ignore */}
  }, []);

  useFocusEffect(useCallback(() => { load(); refreshUser(); }, [load, refreshUser]));

  const generateCode = async () => {
    try {
      const res = await api.post("/connection/code");
      setCode(res.data.code);
    } catch (e: any) { setErr(e.message); }
  };

  const inviteByHandle = async () => {
    setErr(null);
    try {
      const res = await api.post("/connection/invite-user", { username_or_email: inviteHandle.trim() });
      setPartner(res.data.partner);
      setInviteHandle("");
      setInviteVisible(false);
      refreshUser();
    } catch (e: any) { setErr(e.message); }
  };

  const acceptInvite = async () => {
    setErr(null);
    try {
      const res = await api.post("/connection/accept-code", { code: acceptCode.trim() });
      setPartner(res.data.partner);
      setAcceptCode("");
      setAcceptVisible(false);
      refreshUser();
    } catch (e: any) { setErr(e.message); }
  };

  const disconnect = async () => {
    await api.post("/connection/disconnect");
    setPartner(null);
    setCode(null);
    refreshUser();
  };

  const shareCode = async () => {
    if (!code) return;
    try {
      await Share.share({ message: `Join me on Tandem with code: ${code}` });
    } catch {/* ignore */}
  };


  return (
    <View style={styles.root} testID="profile-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Text style={styles.heading}>You</Text>
        <Text style={styles.subhead}>Your space and connections.</Text>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <Pressable
          style={styles.card}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setSpiritVisible(true);
          }}
          delayLongPress={600}
          testID="identity-card"
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.username || "?")[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{user?.username}</Text>
            <Text style={styles.cardEmail}>{user?.email}</Text>
          </View>
        </Pressable>

        {stats && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>Your Tandem story</Text>
            <View style={styles.statsGrid}>
              <StatPill value={stats.lists_created} label="lists" />
              <StatPill value={stats.tasks_checked} label="tasks done" />
              <StatPill value={stats.thoughts_shared} label="thoughts" />
              <StatPill value={stats.journal_entries} label="notes" />
              <StatPill value={stats.routine_streak} label="day streak" highlight />
              <StatPill value={stats.days_using} label="days on Tandem" />
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Preferences</Text>
        <Pressable testID="settings-btn" onPress={() => router.push("/settings")} style={styles.actionRow}>
          <Feather name="sliders" size={18} color={colors.brand} />
          <Text style={styles.actionLabel}>Appearance & colors</Text>
          <Feather name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
        </Pressable>

        {/* Partner / sharing */}
        <Text style={styles.sectionTitle}>Partner</Text>
        {partner ? (
          <View style={styles.partnerCard}>
            <View style={styles.partnerAvatar}>
              <Text style={styles.partnerAvatarText}>{partner.username[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{partner.username}</Text>
              <Text style={styles.cardEmail}>Connected · everything is shared</Text>
            </View>
            <Pressable testID="disconnect-btn" onPress={disconnect} hitSlop={10}>
              <Feather name="x" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.help}>
              Connect with one person to share lists, thoughts, and journal entries.
            </Text>
            <Pressable
              testID="invite-by-handle-btn"
              onPress={() => { setInviteVisible(true); setErr(null); }}
              style={styles.actionRow}
            >
              <Feather name="at-sign" size={18} color={colors.brand} />
              <Text style={styles.actionLabel}>Invite by username or email</Text>
              <Feather name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable
              testID="generate-code-btn"
              onPress={generateCode}
              style={styles.actionRow}
            >
              <Feather name="link-2" size={18} color={colors.brand} />
              <Text style={styles.actionLabel}>Generate an invite code</Text>
              <Feather name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
            {code && (
              <View style={styles.codeCard} testID="invite-code-card">
                <Text style={styles.codeLabel}>Your invite code</Text>
                <Text style={styles.codeBig}>{code}</Text>
                <Pressable testID="share-code-btn" onPress={shareCode} style={styles.shareBtn}>
                  <Feather name="share-2" size={16} color={colors.brand} />
                  <Text style={styles.shareText}>Share</Text>
                </Pressable>
              </View>
            )}
            <Pressable
              testID="have-code-btn"
              onPress={() => { setAcceptVisible(true); setErr(null); }}
              style={styles.actionRow}
            >
              <Feather name="key" size={18} color={colors.brand} />
              <Text style={styles.actionLabel}>I have a code</Text>
              <Feather name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          </>
        )}

        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable testID="signout-btn" onPress={signOut} style={styles.actionRow}>
          <Feather name="log-out" size={18} color={colors.error} />
          <Text style={[styles.actionLabel, { color: colors.error }]}>Sign out</Text>
          <View style={{ width: 18 }} />
        </Pressable>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      <SwipeableSheet visible={inviteVisible} onClose={() => setInviteVisible(false)} scrollable={false}>
        <Text style={styles.sheetTitle}>Invite your partner</Text>
        <Text style={styles.help}>Enter their username or email — they&apos;ll be connected instantly.</Text>
        <TextInput
          testID="invite-handle-input"
          value={inviteHandle}
          onChangeText={setInviteHandle}
          placeholder="username or email"
          placeholderTextColor={colors.onSurfaceTertiary}
          autoCapitalize="none"
          style={styles.sheetInput}
          autoFocus
        />
        {err && <Text style={styles.error}>{err}</Text>}
        <Pressable testID="invite-handle-submit" onPress={inviteByHandle} style={styles.sheetPrimary}>
          <Text style={styles.sheetPrimaryText}>Connect</Text>
        </Pressable>
      </SwipeableSheet>

      <SwipeableSheet visible={acceptVisible} onClose={() => setAcceptVisible(false)} scrollable={false}>
        <Text style={styles.sheetTitle}>Enter invite code</Text>
        <TextInput
          testID="accept-code-input"
          value={acceptCode}
          onChangeText={(t) => setAcceptCode(t.toUpperCase())}
          placeholder="ABC123"
          placeholderTextColor={colors.onSurfaceTertiary}
          autoCapitalize="characters"
          maxLength={6}
          style={[styles.sheetInput, { letterSpacing: 4, fontFamily: fonts.display, fontSize: 28 }]}
          autoFocus
        />
        {err && <Text style={styles.error}>{err}</Text>}
        <Pressable testID="accept-code-submit" onPress={acceptInvite} style={styles.sheetPrimary}>
          <Text style={styles.sheetPrimaryText}>Connect</Text>
        </Pressable>
      </SwipeableSheet>

      <SwipeableSheet visible={spiritVisible} onClose={() => setSpiritVisible(false)} scrollable={false}>
        {(() => {
          const animal = getSpiritAnimal(user?.id ?? "tandem");
          return (
            <View style={styles.spiritContent}>
              <Text style={styles.spiritEmoji}>{animal.emoji}</Text>
              <Text style={styles.spiritTitle}>You are {animal.name}</Text>
              <Text style={styles.spiritTrait}>{animal.trait}.</Text>
              <Text style={styles.spiritHint}>Based on the stars. And your user ID.</Text>
            </View>
          );
        })()}
      </SwipeableSheet>

    </View>
  );
}

function StatPill({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <View style={[statStyles.pill, highlight && statStyles.pillHighlight]}>
      <Text style={[statStyles.value, highlight && statStyles.valueHighlight]}>{value}</Text>
      <Text style={[statStyles.label, highlight && statStyles.labelHighlight]}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  pill: {
    flex: 1, minWidth: "30%", alignItems: "center", paddingVertical: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  pillHighlight: { backgroundColor: colors.brand, borderColor: colors.brand },
  value: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  valueHighlight: { color: "#fff" },
  label: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  labelHighlight: { color: "rgba(255,255,255,0.8)" },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  heading: { fontFamily: fonts.display, fontSize: fontSize.xxxl, color: colors.onSurface },
  subhead: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  scroll: { padding: spacing.xl, gap: spacing.md },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surfaceSecondary },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: "#fff" },
  cardName: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.onSurface },
  cardEmail: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  sectionTitle: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, letterSpacing: 0.8, textTransform: "uppercase", marginTop: spacing.lg },
  statsCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surfaceSecondary },
  statsTitle: { fontFamily: fonts.display, fontSize: fontSize.lg, color: colors.onSurface },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  help: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, lineHeight: 20 },
  partnerCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.brandTertiary },
  partnerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  partnerAvatarText: { fontFamily: fonts.display, fontSize: fontSize.xl, color: "#fff" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  actionLabel: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface },
  codeCard: { borderWidth: 1, borderColor: colors.brand, borderRadius: radius.lg, padding: spacing.lg, alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary },
  codeLabel: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onBrandTertiary, letterSpacing: 0.8, textTransform: "uppercase" },
  codeBig: { fontFamily: fonts.display, fontSize: 40, letterSpacing: 6, color: colors.onBrandTertiary },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  shareText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.brand },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,25,23,0.4)" },
  sheet: { backgroundColor: colors.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.borderStrong, borderRadius: 2, alignSelf: "center" },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, color: colors.onSurface },
  sheetInput: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurface, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, paddingVertical: spacing.md },
  sheetPrimary: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center" },
  sheetPrimaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff" },
  error: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.error },
  spiritContent: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  spiritEmoji: { fontSize: 72, lineHeight: 80 },
  spiritTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface, textAlign: "center" },
  spiritTrait: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 24 },
  spiritHint: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: spacing.sm, textAlign: "center" },
});
