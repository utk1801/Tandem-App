import { ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme";

type Props = {
  children: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
};

export function SwipeableRow({
  children,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
}: Props) {
  const showActions = (canEdit && onEdit) || (canDelete && onDelete);
  if (!showActions) return <>{children}</>;

  const renderRightActions = () => (
    <View style={styles.actions}>
      {canEdit && onEdit && (
        <Pressable style={[styles.action, styles.edit]} onPress={onEdit}>
          <Feather name="edit-2" size={18} color="#fff" />
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
      )}
      {canDelete && onDelete && (
        <Pressable style={[styles.action, styles.delete]} onPress={onDelete}>
          <Feather name="trash-2" size={18} color="#fff" />
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false} friction={2}>
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "stretch" },
  action: {
    width: 76,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
  },
  edit: { backgroundColor: colors.info },
  delete: { backgroundColor: colors.error, borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.sm },
  actionText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: "#fff" },
});
