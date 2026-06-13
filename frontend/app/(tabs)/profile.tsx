import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/contexts/AuthContext";

export default function Profile() {
  const { user, signOut, refreshUser } = useAuth();
  const [partner, setPartner] = useState<any>(null);
  const [code, setCode] = useState<string | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [acceptVisible, setAcceptVisible] = useState(false);
  const [inviteHandle, setInviteHandle] = useState("");
  const [acceptCode, setAcceptCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/connection");
      setPartner(res.data.partner);
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
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.username || "?")[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{user?.username}</Text>
            <Text style={styles.cardEmail}>{user?.email}</Text>
          </View>
        </View>

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

      {/* Invite by handle modal */}
      <Modal visible={inviteVisible} transparent animationType="slide" onRequestClose={() => setInviteVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setInviteVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Invite your partner</Text>
            <Text style={styles.help}>Enter their username or email — they'll be connected instantly.</Text>
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
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Accept code modal */}
      <Modal visible={acceptVisible} transparent animationType="slide" onRequestClose={() => setAcceptVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setAcceptVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

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
});
