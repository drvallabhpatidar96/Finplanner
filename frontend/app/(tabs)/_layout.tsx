import React from "react";
import { Platform, View } from "react-native";
import { Tabs, Slot } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";
import { useResponsive, CONTENT_MAX_WIDTH } from "@/src/responsive";
import { Icon } from "@/src/components/icon";
import { SideNav } from "@/src/components/side-nav";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { isWide } = useResponsive();

  // Desktop / tablet web: persistent side nav + centered multi-column content.
  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.surface }}>
        <SideNav />
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{ flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH }}>
            <Slot />
          </View>
        </View>
      </View>
    );
  }

  if (usesNativeTabs) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="house.fill" />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="transactions">
          <NativeTabs.Trigger.Icon sf="list.bullet.rectangle" />
          <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="cards">
          <NativeTabs.Trigger.Icon sf="creditcard.fill" />
          <NativeTabs.Trigger.Label>Cards</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="more">
          <NativeTabs.Trigger.Icon sf="ellipsis.circle.fill" />
          <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <Icon name="House" size={24} color={color} weight="fill" /> }} />
      <Tabs.Screen name="transactions" options={{ title: "Activity", tabBarIcon: ({ color }) => <Icon name="Receipt" size={24} color={color} weight="fill" /> }} />
      <Tabs.Screen name="cards" options={{ title: "Cards", tabBarIcon: ({ color }) => <Icon name="CreditCard" size={24} color={color} weight="fill" /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color }) => <Icon name="DotsThreeOutline" size={24} color={color} weight="fill" /> }} />
      <Tabs.Screen name="stocks" options={{ title: "stocks", tabBarIcon: ({ color }) => <Icon name="DotsThreeOutline" size={24} color={color} weight="fill" /> }} />
    </Tabs>
  );
}
