import React, { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts } from "expo-font";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth";
import { WorkspaceProvider } from "@/src/workspace";
import { ToastProvider } from "@/src/components/toast";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

function AuthGate() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const seg0 = segments[0] as string | undefined;
    const publicRoutes = ["login", "accept-invite"];
    if (!user) {
      if (!publicRoutes.includes(seg0 || "")) router.replace("/login");
    } else if (!user.country) {
      if (seg0 !== "onboarding") router.replace("/onboarding");
    } else if (seg0 === "login" || seg0 === "onboarding" || seg0 === undefined) {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="add-transaction" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  useFonts({
    DMSans: "https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-400-normal.ttf",
    DMSansMedium: "https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-500-normal.ttf",
    DMSansBold: "https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-700-normal.ttf",
    BarlowCondensed: "https://cdn.jsdelivr.net/fontsource/fonts/barlow-condensed@latest/latin-500-normal.ttf",
    BarlowCondensedBold: "https://cdn.jsdelivr.net/fontsource/fonts/barlow-condensed@latest/latin-700-normal.ttf",
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <KeyboardProvider>
              <AuthProvider>
                <WorkspaceProvider>
                  <ToastProvider>
                    <StatusBar style="light" />
                    <AuthGate />
                  </ToastProvider>
                </WorkspaceProvider>
              </AuthProvider>
            </KeyboardProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
