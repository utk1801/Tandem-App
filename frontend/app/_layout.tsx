import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useFonts } from "expo-font";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/contexts/AuthContext";
import { ThemeProvider, useTheme } from "@/src/contexts/ThemeContext";
import { registerForPush } from "@/src/push";

SplashScreen.preventAutoHideAsync();

// ---- Module-scope push setup (MUST be outside component) ----
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

function Gate() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) {
      router.replace("/(auth)/welcome");
    } else if (user && (segments.length === 0 || inAuth)) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, segments.join("/")]);

  // Register for push on every login / app open
  useEffect(() => {
    if (user?.id) registerForPush(user.id);
  }, [user?.id]);

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}

export default function RootLayout() {
  const router = useRouter();
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

  // Tap handlers — warm (open) + cold-start
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handleTap = (data: any) => {
      const url = data?.deeplink || data?.action_url;
      if (!url) return;
      if (url.startsWith("http")) Linking.openURL(url);
      else router.push(url);
    };
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleTap(response.notification.request.content.data || {});
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleTap(response.notification.request.content.data || {});
    });
    return () => { tapSub.remove(); };
  }, [router]);

  if (!iconsLoaded && !iconsError) return null;
  void textLoaded;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ThemeProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
