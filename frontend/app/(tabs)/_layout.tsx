import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";

export default function TabsLayout() {
  const { colors, fonts } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          fontSize: 11,
          letterSpacing: 0.4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => <Feather name="sun" color={color} size={size} />,
          tabBarButtonTestID: "tab-today",
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: "Lists",
          tabBarIcon: ({ color, size }) => <Feather name="check-square" color={color} size={size} />,
          tabBarButtonTestID: "tab-lists",
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size }) => <Feather name="calendar" color={color} size={size} />,
          tabBarButtonTestID: "tab-calendar",
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: "Notes",
          tabBarIcon: ({ color, size }) => <Feather name="edit-3" color={color} size={size} />,
          tabBarButtonTestID: "tab-notes",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "You",
          tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
          tabBarButtonTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}
