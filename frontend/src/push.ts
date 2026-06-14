// Push registration. Native-only — guarded on web.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "@/src/api";

export async function registerForPush(userId: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const perm = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    if (!perm.granted) return false;
    // Native FCM/APNs token — NOT Expo push token.
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const device_token = (tokenResp as any).data || (tokenResp as any).token;
    if (!device_token) return false;
    await api.post("/register-push", {
      platform: Platform.OS,
      device_token,
    });
    return true;
  } catch {
    return false;
  }
}
