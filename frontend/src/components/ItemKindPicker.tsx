import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";

export type ItemKind = "text" | "link" | "video" | "image";

const KINDS: { key: ItemKind; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "text", label: "Task", icon: "check-square" },
  { key: "link", label: "Link", icon: "link" },
  { key: "video", label: "Video", icon: "play-circle" },
  { key: "image", label: "Image", icon: "image" },
];

type Props = {
  value: ItemKind;
  onChange: (kind: ItemKind) => void;
};

export function ItemKindPicker({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {KINDS.map((k) => {
        const active = value === k.key;
        return (
          <Pressable
            key={k.key}
            onPress={() => onChange(k.key)}
            style={[styles.chip, active && styles.chipOn]}
          >
            <Feather name={k.icon} size={14} color={active ? "#fff" : colors.onSurface} />
            <Text style={[styles.chipText, active && styles.chipTextOn]}>{k.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onSurface },
  chipTextOn: { color: "#fff" },
});
