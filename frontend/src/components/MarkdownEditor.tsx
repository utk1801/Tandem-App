import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";
import { MarkdownContent } from "@/src/components/MarkdownContent";

type Props = {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  minHeight?: number;
  testID?: string;
};

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write in markdown…",
  minHeight = 120,
  testID,
}: Props) {
  const [mode, setMode] = useState<"write" | "preview">("write");

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        <Pressable
          testID={testID ? `${testID}-write-tab` : undefined}
          onPress={() => setMode("write")}
          style={[styles.tab, mode === "write" && styles.tabOn]}
        >
          <Text style={[styles.tabText, mode === "write" && styles.tabTextOn]}>Write</Text>
        </Pressable>
        <Pressable
          testID={testID ? `${testID}-preview-tab` : undefined}
          onPress={() => setMode("preview")}
          style={[styles.tab, mode === "preview" && styles.tabOn]}
        >
          <Text style={[styles.tabText, mode === "preview" && styles.tabTextOn]}>Preview</Text>
        </Pressable>
      </View>

      {mode === "write" ? (
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.onSurfaceTertiary}
          style={[styles.input, { minHeight }]}
          multiline
          textAlignVertical="top"
        />
      ) : (
        <View style={[styles.preview, { minHeight }]}>
          {value.trim() ? (
            <MarkdownContent content={value} compact />
          ) : (
            <Text style={styles.previewEmpty}>Nothing to preview yet.</Text>
          )}
        </View>
      )}

      <Text style={styles.hint}>
        Markdown: **bold**, *italic*, # heading, - list, [link](url), `code`
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  tabs: { flexDirection: "row", gap: spacing.sm },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  tabTextOn: { color: "#fff" },
  input: {
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  preview: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  previewEmpty: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  hint: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, lineHeight: 18 },
});
