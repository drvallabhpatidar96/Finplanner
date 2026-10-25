import React, { useEffect, useState } from "react";
import { Platform, View, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { Icon } from "@/src/components/icon";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { flex: 1, paddingHorizontal: 28, justifyContent: "space-between" },
  brandWrap: { flex: 1, justifyContent: "center" },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  logoBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  brand: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 52, lineHeight: 54 },
  accent: { color: c.brandPrimary },
  tagline: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 17, lineHeight: 25, marginTop: 8 },
  bullets: { marginTop: 28, gap: 14 },
  bullet: { flexDirection: "row", alignItems: "center", gap: 12 },
  bulletText: { color: c.onSurfaceSecondary, fontFamily: fonts.textMedium, fontSize: 15 },
  google: {
    backgroundColor: "#FFFFFF", borderRadius: 14, height: 56, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 12,
  },
  googleText: { color: "#1F1F1F", fontFamily: fonts.textBold, fontSize: 16 },
  apple: { width: "100%", height: 56, marginTop: 12 },
  legal: { color: c.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: 16 },
}));

const BULLETS = [
  { icon: "Users", text: "Personal + household money in one app" },
  { icon: "Lightning", text: "Faster entry than any spreadsheet" },
  { icon: "ChartPieSlice", text: "Live shared visibility for couples & families" },
];

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signInWithApple } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [AppleAuth, setAppleAuth] = useState<any>(null);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    (async () => {
      try {
        const mod = await import("expo-apple-authentication");
        if (await mod.isAvailableAsync()) setAppleAuth(mod);
      } catch {}
    })();
  }, []);

  const onGoogle = async () => {
    setBusy(true);
    try {
      await signIn();
    } finally {
      setBusy(false);
    }
  };

  const onApple = async () => {
    try {
      await signInWithApple();
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        toast.show(e?.message || "Apple sign-in failed", "error");
      }
    }
  };

  return (
    <View style={s.root}>
      <LinearGradient
        colors={[colors.brandTertiary, colors.surface, colors.surface]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 420 }}
      />
      <View style={[s.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
        <View style={s.brandWrap}>
          <View style={s.logoRow}>
            <View style={s.logoBox}>
              <Icon name="Wallet" size={28} color={colors.onBrandPrimary} weight="fill" />
            </View>
          </View>
          <Text style={s.brand}>
            Fin<Text style={s.accent}>Planner</Text>
          </Text>
          <Text style={s.tagline}>
            Track your own money and your household money in one app — without spreadsheet pain.
          </Text>
          <View style={s.bullets}>
            {BULLETS.map((b) => (
              <View key={b.icon} style={s.bullet}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={b.icon} size={18} color={colors.brandPrimary} weight="bold" />
                </View>
                <Text style={s.bulletText}>{b.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View>
          <Pressable testID="google-signin-button" style={({ pressed }) => [s.google, { opacity: pressed || busy ? 0.85 : 1 }]} onPress={onGoogle}>
            <Icon name="GoogleLogo" size={22} color="#1F1F1F" weight="bold" />
            <Text style={s.googleText}>{busy ? "Signing in…" : "Continue with Google"}</Text>
          </Pressable>
          {AppleAuth && (
            <AppleAuth.AppleAuthenticationButton
              testID="apple-signin-button"
              buttonType={AppleAuth.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuth.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14}
              style={s.apple}
              onPress={onApple}
            />
          )}
          <Text style={s.legal}>By continuing you agree to our Terms & Privacy Policy.</Text>
        </View>
      </View>
    </View>
  );
}
