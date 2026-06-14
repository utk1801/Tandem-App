import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { publicEnv } from "@/src/env";

const SUPABASE_URL = publicEnv("EXPO_PUBLIC_SUPABASE_URL", "supabaseUrl");
const SUPABASE_ANON_KEY = publicEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "supabaseAnonKey");

// Universal storage adapter — SecureStore on native, localStorage on web.
const UniversalStorage = {
  getItem: async (key: string) => {
    if (Platform.OS === "web") {
      try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
    }
    return await SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === "web") {
      try { globalThis.localStorage?.setItem(key, value); } catch {/* ignore */}
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string) => {
    if (Platform.OS === "web") {
      try { globalThis.localStorage?.removeItem(key); } catch {/* ignore */}
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: UniversalStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
