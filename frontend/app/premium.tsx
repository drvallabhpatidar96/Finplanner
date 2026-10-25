import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Icon } from "@/src/components/icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";

const HERO = "https://images.unsplash.com/photo-1635776062360-af423602aff3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzB8MHwxfHNlYXJjaHwxfHxkYXJrJTIwc2xlZWslMjBwcmVtaXVtJTIwZ3JhZGllbnQlMjBzcGFjZXxlbnwwfHx8fDE3OTA4NzQ4MDB8MA&ixlib=rb-4.1.0&q=85";

const FEATURES = [
  { icon: "Sparkle", title: "Ad-free experience", sub: "Remove every ad slot across the app" },
  { icon: "Receipt", title: "Bill Scan", sub: "Snap a bill, auto-extract line items (coming soon)" },
  { icon: "ChartLineUp", title: "Priority planning", sub: "Advanced credit card & budget insights" },
  { icon: "Users", title: "Unlimited households", sub: "Add as many shared workspaces as you need" },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 280, justifyContent: "flex-end" },
  heroImg: { ...StyleSheetAbsolute() },
  close: { position: "absolute", top: 8, left: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  crown: { width: 56, height: 56, borderRadius: 16, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { color: "#FFFFFF", fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 42 },
  sub: { color: "#E0E0E0", fontFamily: fonts.text, fontSize: 15, marginTop: 6 },
  feat: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  featTitle: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 16 },
  featSub: { color: c.muted, fontFamily: fonts.text, fontSize: 13, marginTop: 2 },
  priceCard: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: c.brandPrimary, marginTop: 8 },
}));

function StyleSheetAbsolute() {
  return { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };
}

export default function Premium() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const upgrade = useMutation({
    mutationFn: () => api("/users/premium", { method: "POST" }),
    onSuccess: async () => { await refreshUser(); toast.show("Welcome to Premium!", "success"); router.back(); },
    onError: (e: any) => toast.show(e.message || "Failed", "error"),
  });

  return (
    <View style={s.root}>
      <View style={s.hero}>
        <Image source={{ uri: HERO }} style={s.heroImg} contentFit="cover" transition={300} />
        <LinearGradient colors={["transparent", "rgba(18,18,18,0.6)", colors.surface]} style={StyleSheetAbsolute()} />
        <Pressable style={[s.close, { top: insets.top + 4 }]} testID="premium-close" onPress={() => router.back()}>
          <Icon name="X" size={22} color="#FFFFFF" weight="bold" />
        </Pressable>
        <View style={{ padding: 20 }}>
          <View style={s.crown}><Icon name="Crown" size={30} color={colors.onBrandPrimary} weight="fill" /></View>
          <Text style={s.title}>FinPlanner{"\n"}Premium</Text>
          <Text style={s.sub}>Go ad-free and unlock Bill Scan.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 110 }}>
        {FEATURES.map((f) => (
          <View key={f.title} style={s.feat}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
              <Icon name={f.icon} size={22} color={colors.brandPrimary} weight="bold" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.featTitle}>{f.title}</Text>
              <Text style={s.featSub}>{f.sub}</Text>
            </View>
            <Icon name="Check" size={20} color={colors.success} weight="bold" />
          </View>
        ))}

        <View style={s.priceCard}>
          <Text style={{ color: colors.muted, fontFamily: fonts.textMedium, fontSize: 13 }}>Premium plan</Text>
          <Text style={{ color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: 32, marginTop: 2 }}>₹299<Text style={{ fontSize: 16, color: colors.muted }}> / month</Text></Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 6 }}>Entitlement framework ready. Real Stripe / Apple / Google billing wires in before store launch.</Text>
        </View>
      </ScrollView>

      <View style={{ position: "absolute", left: 20, right: 20, bottom: insets.bottom + 16 }}>
        {user?.premium ? (
          <Button title="You're Premium 🎉" disabled testID="already-premium" />
        ) : (
          <Button title="Upgrade Now" icon="Crown" testID="upgrade-now" loading={upgrade.isPending} onPress={() => upgrade.mutate()} />
        )}
      </View>
    </View>
  );
}
