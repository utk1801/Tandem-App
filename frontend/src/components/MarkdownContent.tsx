import { Linking, StyleSheet, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";

type Props = {
  content: string;
  compact?: boolean;
};

function buildStyles(compact: boolean) {
  const bodySize = compact ? fontSize.base : fontSize.lg;
  const lineHeight = compact ? 22 : 26;
  return StyleSheet.create({
    body: { color: colors.onSurface, fontFamily: fonts.body, fontSize: bodySize, lineHeight },
    heading1: { fontFamily: fonts.display, fontSize: compact ? fontSize.xl : fontSize.xxl, color: colors.onSurface, marginTop: spacing.sm, marginBottom: spacing.xs },
    heading2: { fontFamily: fonts.display, fontSize: compact ? fontSize.lg : fontSize.xl, color: colors.onSurface, marginTop: spacing.sm, marginBottom: spacing.xs },
    heading3: { fontFamily: fonts.display, fontSize: bodySize, color: colors.onSurface, marginTop: spacing.sm, marginBottom: spacing.xs },
    paragraph: { marginTop: 0, marginBottom: spacing.sm },
    bullet_list: { marginBottom: spacing.sm },
    ordered_list: { marginBottom: spacing.sm },
    list_item: { marginBottom: spacing.xs },
    blockquote: {
      backgroundColor: colors.surfaceSecondary,
      borderLeftColor: colors.brand,
      borderLeftWidth: 3,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.sm,
      borderRadius: radius.sm,
    },
    code_inline: {
      fontFamily: fonts.body,
      backgroundColor: colors.surfaceSecondary,
      color: colors.onSurface,
      paddingHorizontal: 4,
      borderRadius: 4,
    },
    fence: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.sm,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    code_block: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurface },
    link: { color: colors.brand, textDecorationLine: "underline" },
    strong: { fontFamily: fonts.bodyMedium, color: colors.onSurface },
    em: { fontFamily: fonts.body, fontStyle: "italic" },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: spacing.md },
  });
}

export function MarkdownContent({ content, compact = false }: Props) {
  const styles = buildStyles(compact);

  return (
    <View>
      <Markdown
        style={styles}
        onLinkPress={(url) => {
          Linking.openURL(url).catch(() => {});
          return false;
        }}
      >
        {content}
      </Markdown>
    </View>
  );
}
