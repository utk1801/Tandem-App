import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/contexts/AuthContext";

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    const inTabs = segments[0] === "(tabs)";
    if (!user && !inAuth) {
      router.replace("/(auth)/welcome");
    } else if (user && (segments.length === 0 || inAuth)) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, segments.join("/")]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FDFCF9" } }} />
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [textLoaded] = useFonts({
    Fraunces: "https://fonts.gstatic.com/s/fraunces/v34/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk.ttf",
    "Fraunces-Italic": "https://fonts.gstatic.com/s/fraunces/v34/6NUu8FyLNQOQZAnv9bYEvDiOzGYwbpu5dD2dx_TmNb-T.ttf",
    DMSans: "https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.ttf",
    "DMSans-Medium": "https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqbtJ964.ttf",
  });

  useEffect(() => {
    if (iconsLoaded || iconsError) {
      SplashScreen.hideAsync();
    }
  }, [iconsLoaded, iconsError]);

  if (!iconsLoaded && !iconsError) return null;
  // We still proceed even if text fonts fail (graceful fallback to system)
  void textLoaded;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
