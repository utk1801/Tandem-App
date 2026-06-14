import { Alert, Platform } from "react-native";

export function confirmDelete(title: string, message: string, onConfirm: () => void) {
  Alert.alert(
    title,
    message,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onConfirm },
    ],
    { cancelable: Platform.OS === "android" },
  );
}
