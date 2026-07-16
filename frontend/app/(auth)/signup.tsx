import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { spacing, radius, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/contexts/ThemeContext";
import { useAuth } from "@/src/contexts/AuthContext";

export default function Signup() {
  const { colors } = useTheme();
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    setErr(null);
    if (!email.trim() || !username.trim() || !password) {
      setErr("All fields are required");
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      await signUp(email.trim(), username.trim(), password);
    } catch (e: any) {
      setErr(e.message || "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  title: {
    fontFamily: fonts.display,
    fontSize: fontSize.xxxl,
    color: colors.onSurface,
    marginTop: spacing.lg,
  },
  subtitle: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurfaceSecondary },
  field: { gap: spacing.xs },
  label: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  input: {
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    paddingVertical: spacing.md,
  },
  primary: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: "#fff", fontWeight: "500" },
  switch: { alignItems: "center", paddingVertical: spacing.md },
  switchText: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  switchAccent: { color: colors.brand, fontFamily: fonts.bodyMedium },
  error: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.error },
});

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="signup-screen">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => router.back()} hitSlop={10} testID="back-btn">
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Begin together.</Text>
          <Text style={styles.subtitle}>Make space for your shared everyday.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              testID="signup-username-input"
              value={username}
              onChangeText={setUsername}
              placeholder="your handle"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="signup-email-input"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="signup-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="at least 6 characters"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
              style={styles.input}
            />
          </View>
          {err && <Text style={styles.error} testID="signup-error">{err}</Text>}
          <Pressable
            testID="signup-submit-button"
            onPress={onSubmit}
            disabled={busy}
            style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create account</Text>}
          </Pressable>

          <Pressable
            testID="signup-switch-login"
            onPress={() => router.replace("/(auth)/login")}
            style={styles.switch}
          >
            <Text style={styles.switchText}>
              Already with us? <Text style={styles.switchAccent}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
