// Push registration.
// iOS (free Apple dev account): local notifications only — APNs entitlement
// requires a paid account, so remote push is skipped entirely on iOS.
// Android: registers Expo push token with the backend for remote push.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "@/src/api";

export async function registerForPush(_userId: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  // Free Apple dev account has no APNs entitlement — skip remote push on iOS.
  if (Platform.OS === "ios") return false;
  if (!Device.isDevice) return false;

  try {
    const perm = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    if (!perm.granted) return false;

    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
    });

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    if (!projectId) return false;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenData.data;
    if (!expoPushToken) return false;

    await api.post("/register-push", {
      platform: "android",
      device_token: expoPushToken,
    });
    return true;
  } catch {
    return false;
  }
}
