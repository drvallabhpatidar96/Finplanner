import React from "react";
import { Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";
import { useAuth } from "@/src/auth";
import { useWorkspace } from "@/src/workspace";
import { Icon } from "@/src/components/icon";

export function Fab({ onPress, icon = "Plus", testID = "add-transaction-fab" }: { onPress?: () => void; icon?: string; testID?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { current } = useWorkspace();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  // View-only members don't get the add button (backend also enforces).
  if (current?.type === "shared") {
    const me = current.members.find((m) => m.user_id === user?.user_id);
    const perm = me?.role === "owner" ? "full" : me?.permission || "full";
    if (perm === "view") return null;
  }
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (onPress) onPress();
        else router.push("/add-transaction");
      }}
      style={({ pressed }) => ({
        position: "absolute",
        right: 20,
        bottom: bottomChrome + 20,
        width: 60,
        height: 60,
        borderRadius: 20,
        backgroundColor: colors.brandPrimary,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: pressed ? 0.92 : 1 }],
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      })}
    >
      <Icon name={icon} size={30} color={colors.onBrandPrimary} weight="bold" />
    </Pressable>
  );
}
