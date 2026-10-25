import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useWorkspace } from "@/src/workspace";
import { Icon } from "@/src/components/icon";
import { Button, Display } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", padding: 28 },
  iconBox: { width: 84, height: 84, borderRadius: 24, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  sub: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 15, textAlign: "center", lineHeight: 22, marginTop: 10, marginBottom: 28 },
  note: { color: c.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: 16 },
}));

export default function AcceptInvite() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { user, loading, signIn } = useAuth();
  const { setCurrentId, refetch } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !token) return;
    (async () => {
      try {
        const data = await api(`/invites/${token}`);
        setInfo(data);
      } catch (e: any) {
        setError(e.message || "Invitation not found");
      }
    })();
  }, [user, token]);

  const accept = async () => {
    setBusy(true);
    try {
      const ws = await api(`/invites/${token}/accept`, { method: "POST" });
      await refetch();
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      setCurrentId(ws.id);
      toast.show(`Welcome to ${ws.name}!`, "success");
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e.message || "Could not accept", "error");
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      <View style={s.iconBox}>
        <Icon name="Users" size={40} color={colors.brandPrimary} weight="duotone" />
      </View>

      {!user && !loading ? (
        <>
          <Display style={{ fontSize: 30, color: colors.onSurface, textAlign: "center" }}>You're invited!</Display>
          <Text style={s.sub}>Sign in with Google to accept your household invitation.</Text>
          <Button title="Continue with Google" icon="GoogleLogo" testID="accept-signin" onPress={signIn} style={{ alignSelf: "stretch" }} />
        </>
      ) : loading || (user && !info && !error) ? (
        <ActivityIndicator color={colors.brandPrimary} />
      ) : error ? (
        <>
          <Display style={{ fontSize: 26, color: colors.onSurface, textAlign: "center" }}>Invitation unavailable</Display>
          <Text style={s.sub}>{error}</Text>
          <Button title="Go to app" variant="secondary" testID="accept-go-home" onPress={() => router.replace("/(tabs)")} style={{ alignSelf: "stretch" }} />
        </>
      ) : (
        <>
          <Display style={{ fontSize: 30, color: colors.onSurface, textAlign: "center" }} testID="accept-title">
            Join {info.household_name}
          </Display>
          <Text style={s.sub}>
            {info.invited_by_name} invited you to share household finances. You'll see shared accounts, budgets and transactions.
          </Text>
          {info.status !== "pending" ? (
            <Text style={{ color: colors.warning, fontFamily: fonts.textMedium, marginBottom: 20 }}>This invitation is {info.status}.</Text>
          ) : !info.matches_you ? (
            <Text style={{ color: colors.error, fontFamily: fonts.textMedium, marginBottom: 20, textAlign: "center" }}>
              This invite was sent to {info.email}. Sign in with that Google account to accept.
            </Text>
          ) : (
            <Button title="Accept invitation" icon="Check" testID="accept-invite-btn" loading={busy} onPress={accept} style={{ alignSelf: "stretch" }} />
          )}
          <Text style={s.note}>Signed in as {user?.email}</Text>
        </>
      )}
    </View>
  );
}
