import React from "react";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/icon";
import { useAuth } from "@/src/auth";
import { WorkspaceSwitcher } from "@/src/components/workspace-switcher";

const NAV = [
  { label: "Home", icon: "House", path: "/(tabs)" as const, match: ["/", "/(tabs)"] },
  { label: "Activity", icon: "Receipt", path: "/(tabs)/transactions" as const, match: ["/transactions"] },
  { label: "Cards", icon: "CreditCard", path: "/(tabs)/cards" as const, match: ["/cards"] },
  { label: "More", icon: "DotsThreeOutline", path: "/(tabs)/more" as const, match: ["/more"] },
];

const useStyles = makeStyles((c) => ({
  nav: { width: 248, backgroundColor: c.surfaceSecondary, borderRightWidth: 1, borderRightColor: c.border, paddingHorizontal: 12 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, marginBottom: 18 },
  logoBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  brand: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 24 },
  item: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12, marginBottom: 4 },
  itemText: { fontFamily: fonts.textMedium, fontSize: 16 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, marginTop: 10 },
  addText: { color: c.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 15 },
}));

export function SideNav() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <View style={[s.nav, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={s.brandRow}>
        <View style={s.logoBox}><Icon name="Wallet" size={22} color={colors.onBrandPrimary} weight="fill" /></View>
        <Text style={s.brand}>FinPlanner</Text>
      </View>

      <View style={{ marginBottom: 16 }}>
        <WorkspaceSwitcher />
      </View>

      {NAV.map((n) => {
        const active = n.match.some((m) => (m === "/" || m === "/(tabs)" ? pathname === "/" : pathname.startsWith(m)));
        return (
          <Pressable
            key={n.label}
            testID={`sidenav-${n.label.toLowerCase()}`}
            style={[s.item, { backgroundColor: active ? colors.surfaceTertiary : "transparent" }]}
            onPress={() => router.replace(n.path)}
          >
            <Icon name={n.icon} size={22} color={active ? colors.brandPrimary : colors.muted} weight={active ? "fill" : "regular"} />
            <Text style={[s.itemText, { color: active ? colors.onSurface : colors.muted }]}>{n.label}</Text>
          </Pressable>
        );
      })}

      <Pressable style={s.addBtn} testID="sidenav-add" onPress={() => router.push("/add-transaction")}>
        <Icon name="Plus" size={20} color={colors.onBrandPrimary} weight="bold" />
        <Text style={s.addText}>Add transaction</Text>
      </Pressable>
    </View>
  );
}
