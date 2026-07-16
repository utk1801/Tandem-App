import { ScrollView, View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTheme, type ThemeColors } from "@/src/contexts/ThemeContext";

const PRESETS = [
  "#0E9B9B", "#A64D3C", "#4F7359", "#60748C", "#D9933D", "#8B5CF6",
  "#E11D48", "#0369A1", "#7C3AED", "#059669", "#B45309", "#1C1917",
];

function ColorField({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: "DMSans-Medium", fontSize: 12, color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: value, borderWidth: 1, borderColor: colors.border }} />
        <TextInput
          value={value}
          onChangeText={onChange}
          autoCapitalize="characters"
          placeholder="#RRGGBB"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={{ flex: 1, fontFamily: "DMSans", fontSize: 16, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface }}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {PRESETS.map((c) => (
          <Pressable key={`${label}-${c}`} onPress={() => onChange(c)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 1, borderColor: colors.border }} />
        ))}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, prefs, setPref, resetPrefs } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={{ fontFamily: "Fraunces", fontSize: 24, color: colors.onSurface }}>Appearance</Text>
      </SafeAreaView>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
        <Text style={{ fontFamily: "DMSans", fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 20 }}>
          Tap a preset or enter a hex color. Changes apply across themed screens.
        </Text>
        <ColorField label="Accent" value={prefs.brand} onChange={(v) => setPref("brand", v)} colors={colors} />
        <ColorField label="Background" value={prefs.surface} onChange={(v) => setPref("surface", v)} colors={colors} />
        <ColorField label="Text" value={prefs.onSurface} onChange={(v) => setPref("onSurface", v)} colors={colors} />
        <ColorField label="Card background" value={prefs.surfaceSecondary} onChange={(v) => setPref("surfaceSecondary", v)} colors={colors} />
        <Pressable onPress={resetPrefs} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 14, alignItems: "center" }}>
          <Text style={{ fontFamily: "DMSans-Medium", fontSize: 14, color: colors.error }}>Reset to defaults</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
