// Push registration.
// Uses Expo Push API so both iOS (via Expo Go) and Android work without
// a paid Apple developer account. Standalone iOS builds still need APNs entitlement.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "@/src/api";

export async function registerForPush(_userId: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!Device.isDevice) return false;

  try {
    const perm = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    if (!perm.granted) return false;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
      });
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    if (!projectId) return false;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenData.data;
    if (!expoPushToken) return false;

    await api.post("/register-push", {
      platform: Platform.OS,
      device_token: expoPushToken,
    });
    return true;
  } catch {
    return false;
  }
}
