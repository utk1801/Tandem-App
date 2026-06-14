import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  backendUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export function publicEnv(name: string, extraKey: keyof Extra): string {
  const value = process.env[name] || extra[extraKey];
  if (!value) {
    throw new Error(
      `${name} is required. Set EXPO_PUBLIC_* in frontend/.env or add ${extraKey === "supabaseAnonKey" ? "SUPABASE_ANON_KEY" : extraKey === "supabaseUrl" ? "SUPABASE_URL" : "BACKEND_URL"} to the repo root .env.`,
    );
  }
  return value;
}

/** Simulators can use localhost; physical devices need the Metro LAN IP. */
export function resolveBackendUrl(raw: string): string {
  const url = raw.replace(/\/$/, "");
  if (Platform.OS === "web") return url;

  // iOS Simulator / Android Emulator — localhost reaches your Mac.
  if (!Device.isDevice) {
    if (Platform.OS === "android") {
      return url.replace("localhost", "10.0.2.2").replace("127.0.0.1", "10.0.2.2");
    }
    return url;
  }

  const lanHost =
    Constants.expoGoConfig?.debuggerHost?.split(":")[0] ??
    Constants.expoConfig?.hostUri?.split(":")[0];

  if (lanHost) {
    return url.replace("localhost", lanHost).replace("127.0.0.1", lanHost);
  }
  return url;
}
