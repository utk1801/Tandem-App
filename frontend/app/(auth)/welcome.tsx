import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { spacing, radius, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/contexts/ThemeContext";

const HERO = "https://images.unsplash.com/photo-1708465034183-7e3528d41944?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTN8MHwxfHNlYXJjaHwxfHx3YXJtJTI0bW9ybmluZyUyMHN1bmxpZ2h0JTIwc29mdCUyMGFic3RyYWN0JTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODEzMjMyNzl8MA&ixlib=rb-4.1.0&q=85";

export default function Welcome() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceInverse },
  safe: { flex: 1, justifyContent: "space-between", paddingHorizontal: spacing.xl },
  top: { paddingTop: spacing.lg },
  brand: {
    fontFamily: fonts.display,
    fontSize: fontSize.xl,
    color: colors.surface,
    letterSpacing: 0.4,
  },
  bottom: { paddingBottom: spacing.lg, gap: spacing.md },
  headline: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 46,
    color: colors.surface,
    marginBottom: spacing.sm,
  },
  subhead: {
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    color: "rgba(253,252,249,0.85)",
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 16,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  primaryBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.lg,
    color: colors.onBrandPrimary,
    fontWeight: "500",
  },
  secondaryBtn: { paddingVertical: 14, alignItems: "center" },
  secondaryBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.lg,
    color: colors.surface,
    fontWeight: "500",
  },
});

  return (
    <View style={styles.root} testID="welcome-screen">
      <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(253,252,249,0.0)", "rgba(44,40,37,0.85)"]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.top}>
          <Text style={styles.brand}>tandem</Text>
        </View>
        <View style={styles.bottom}>
          <Text style={styles.headline}>A shared space{"\n"}for the everyday.</Text>
          <Text style={styles.subhead}>
            Lists, thoughts, journals, and morning rituals — together with someone you love.
          </Text>
          <Pressable
            testID="welcome-signup-button"
            onPress={() => router.push("/(auth)/signup")}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.primaryBtnText}>Create account</Text>
          </Pressable>
          <Pressable
            testID="welcome-login-button"
            onPress={() => router.push("/(auth)/login")}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>I already have one</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
