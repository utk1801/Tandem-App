// Notification scheduling and registration helpers using expo-notifications.
// Persists scheduled notification IDs keyed by entity id, so cancelling /
// rescheduling is reliable across app restarts.

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { storage } from "@/src/utils/storage";

const MAP_KEY = "tandem_notif_map_v1";

// Configure how foreground notifications are shown.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function readMap(): Promise<Record<string, string>> {
  try {
    const raw = await storage.getItem(MAP_KEY, "");
    if (typeof raw === "string" && raw) {
      return JSON.parse(raw);
    }
    return {};
  } catch {
    return {};
  }
}

async function writeMap(m: Record<string, string>) {
  await storage.setItem(MAP_KEY, JSON.stringify(m));
}

export async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  if (!settings.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return req.granted;
}

export async function cancelReminder(key: string): Promise<void> {
  if (Platform.OS === "web") return;
  const map = await readMap();
  const id = map[key];
  if (id) {
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch {/* ignore */}
    delete map[key];
    await writeMap(map);
  }
}

// Schedule a one-shot reminder.
// fireAt: Date in the future (local time). Returns true if scheduled.
export async function scheduleReminder(
  key: string,
  title: string,
  body: string,
  fireAt: Date,
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  await cancelReminder(key);
  const now = Date.now();
  const ts = fireAt.getTime();
  if (ts <= now + 1000) return false;
  const granted = await ensurePermissions();
  if (!granted) return false;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      // @ts-ignore - DATE trigger type accepted
      trigger: { type: "date", date: fireAt },
    });
    const map = await readMap();
    map[key] = id;
    await writeMap(map);
    return true;
  } catch {
    return false;
  }
}

// Get count of pending reminders (for badge / UI hints).
export async function pendingCount(): Promise<number> {
  if (Platform.OS === "web") return 0;
  try {
    const list = await Notifications.getAllScheduledNotificationsAsync();
    return list.length;
  } catch {
    return 0;
  }
}

/**
 * Registers the device for Firebase/Remote Push Notifications.
 * @returns The push token string or null if failed.
 */
export async function registerForRemoteNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  // Remote notifications require a physical device.
  if (!Device.isDevice) {
    console.warn("Remote notifications require a physical device.");
    return null;
  }

  const hasPermission = await ensurePermissions();
  if (!hasPermission) return null;

  try {
    // Android specific channel requirement for remote notifications
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        lightColor: "#FF231F7C",
      });
    }

    // Fetch the token linked to your EAS Project
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
      console.error("EAS Project ID not found in app.json configuration.");
      return null;
    }

    // Get the Expo Push Token to route through Expo's proxy to Firebase
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (error) {
    console.error("Failed to fetch push token:", error);
    return null;
  }
}
