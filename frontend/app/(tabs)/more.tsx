import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { useWorkspace } from "@/src/workspace";
import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/components/icon";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 28 },
  profile: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginHorizontal: 16, marginTop: 16, backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 16 },
  email: { color: c.muted, fontFamily: fonts.text, fontSize: 13, marginTop: 2 },
  premiumBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginHorizontal: 16, marginTop: 12, backgroundColor: c.brandTertiary, borderRadius: 16 },
  premiumText: { color: c.onBrandTertiary, fontFamily: fonts.textBold, fontSize: 15 },
  premiumSub: { color: c.onBrandTertiary, fontFamily: fonts.text, fontSize: 12, marginTop: 2, opacity: 0.85 },
  sectionLabel: { color: c.muted, fontFamily: fonts.textBold, fontSize: 12, letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15, paddingHorizontal: 16, marginHorizontal: 16, borderRadius: 12 },
  itemText: { flex: 1, color: c.onSurface, fontFamily: fonts.textMedium, fontSize: 16 },
}));

type Item = { icon: string; label: string; route?: string; danger?: boolean; onPress?: () => void };

export default function More() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { current } = useWorkspace();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const isShared = current?.type === "shared";

  const manage: Item[] = [
    { icon: "Wallet", label: "Accounts", route: "/accounts" },
    { icon: "Tag", label: "Categories", route: "/categories" },
    { icon: "Target", label: "Budgets", route: "/budgets" },
    { icon: "Repeat", label: "Recurring", route: "/recurring" },
    { icon: "Bank", label: "Fixed Deposits", route: "/fixed-deposits" },
    { icon: "ChartLineUp", label: "Stock Holdings", route: "/stocks" },
    { icon: "UploadSimple", label: "Import CSV", route: "/csv-import" },
    { icon: "Sparkle", label: "Bill Scan", route: "/bill-scan" },
  ];
  if (isShared) manage.push({ icon: "ClockCounterClockwise", label: "Audit Log", route: "/audit-log" });

  const account: Item[] = [
    { icon: "Users", label: "Households", route: "/workspaces" },
    { icon: "Gear", label: "Settings", route: "/settings" },
    { icon: "SignOut", label: "Sign out", danger: true, onPress: signOut },
  ];

  const renderItem = (it: Item) => (
    <Pressable
      key={it.label}
      testID={`more-${it.label.toLowerCase().replace(/ /g, "-")}`}
      style={({ pressed }) => [s.item, { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" }]}
      onPress={() => (it.onPress ? it.onPress() : it.route ? router.push(it.route as any) : null)}
    >
      <Icon name={it.icon} size={22} color={it.danger ? colors.error : colors.brandPrimary} weight="bold" />
      <Text style={[s.itemText, it.danger ? { color: colors.error } : null]}>{it.label}</Text>
      {!it.danger ? <Icon name="CaretRight" size={18} color={colors.muted} /> : null}
    </Pressable>
  );

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Text style={s.title}>More</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomChrome + 24 }} showsVerticalScrollIndicator={false}>
        <View style={s.profile}>
          <View style={s.avatar}>
            <Text style={{ color: colors.onBrandTertiary, fontFamily: fonts.displayBold, fontSize: 22 }}>
              {(user?.name || "U").slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{user?.name}</Text>
            <Text style={s.email}>{user?.email}</Text>
          </View>
          {user?.premium ? <Icon name="Crown" size={24} color={colors.warning} weight="fill" /> : null}
        </View>

        {!user?.premium && (
          <Pressable style={s.premiumBanner} testID="premium-banner" onPress={() => router.push("/premium")}>
            <Icon name="Crown" size={28} color={colors.warning} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={s.premiumText}>Upgrade to Premium</Text>
              <Text style={s.premiumSub}>Remove ads · unlock Bill Scan</Text>
            </View>
            <Icon name="CaretRight" size={20} color={colors.onBrandTertiary} />
          </Pressable>
        )}

        <Text style={s.sectionLabel}>MANAGE</Text>
        {manage.map(renderItem)}

        <Text style={s.sectionLabel}>ACCOUNT</Text>
        {account.map(renderItem)}
      </ScrollView>
    </View>
  );
}
