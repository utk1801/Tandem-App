import { View, ActivityIndicator } from "react-native";
import { useTheme } from "@/src/contexts/ThemeContext";

export default function Index() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }} testID="splash-screen">
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}
