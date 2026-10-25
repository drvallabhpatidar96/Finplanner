import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useWorkspace } from "@/src/workspace";
import { fmtFullDate } from "@/src/format";
import { Header } from "@/src/components/header";
import { Icon } from "@/src/components/icon";
import { Button, Field } from "@/src/components/ui";
import { SheetModal } from "@/src/components/sheet-modal";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  section: { color: c.muted, fontFamily: fonts.textBold, fontSize: 12, letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, marginHorizontal: 16, borderWidth: 1, borderColor: c.border },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  name: { color: c.onSurface, fontFamily: fonts.textMedium, fontSize: 15, flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontFamily: fonts.textBold, fontSize: 11 },
  codeBox: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, borderStyle: "dashed" },
  code: { color: c.brandPrimary, fontFamily: fonts.displayBold, fontSize: 24, letterSpacing: 2, flex: 1 },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: c.surfaceTertiary },
}));

const PERMS = [
  { key: "full", label: "Full access", desc: "Add, edit and delete" },
  { key: "edit", label: "Add & edit", desc: "Cannot delete" },
  { key: "view", label: "View only", desc: "Cannot change anything" },
];

export default function Members() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const wsId = params.id || "";
  const { user } = useAuth();
  const { workspaces, refetch } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const ws = workspaces.find((w) => w.id === wsId);
  const isOwner = ws?.owner_id === user?.user_id;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [permFor, setPermFor] = useState<any>(null);

  const { data: invites = [] } = useQuery({
    queryKey: ["invites", wsId],
    queryFn: () => api(`/workspaces/${wsId}/invites`),
    enabled: !!wsId && isOwner,
  });

  const invite = useMutation({
    mutationFn: () => api(`/workspaces/${wsId}/invites`, { method: "POST", body: { email: inviteEmail } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["invites", wsId] });
      setInviteOpen(false); setInviteEmail("");
      toast.show(r?.email_sent === false ? "Invite created — email undeliverable, share the code instead" : "Invitation sent", r?.email_sent === false ? "error" : "success");
    },
    onError: (e: any) => toast.show(e.message || "Failed", "error"),
  });
  const resend = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${wsId}/invites/${id}/resend`, { method: "POST" }),
    onSuccess: () => toast.show("Invitation resent", "success"),
    onError: (e: any) => toast.show(e.message || "Failed", "error"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${wsId}/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invites", wsId] }); toast.show("Invitation revoked", "success"); },
  });
  const setPerm = useMutation({
    mutationFn: ({ memberId, permission }: any) => api(`/workspaces/${wsId}/members/${memberId}`, { method: "PATCH", body: { permission } }),
    onSuccess: () => { refetch(); setPermFor(null); toast.show("Access updated", "success"); },
    onError: (e: any) => toast.show(e.message || "Failed", "error"),
  });
  const remove = useMutation({
    mutationFn: (memberId: string) => api(`/workspaces/${wsId}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: () => { refetch(); toast.show("Member removed", "success"); },
    onError: (e: any) => toast.show(e.message || "Failed", "error"),
  });

  const copyCode = async () => {
    if (!ws?.invite_code) return;
    await Clipboard.setStringAsync(ws.invite_code);
    toast.show("Invite code copied", "success");
  };
  const shareCode = async () => {
    if (!ws?.invite_code) return;
    try {
      await Share.share({ message: `Join my household "${ws.name}" on FinPlanner with invite code: ${ws.invite_code}` });
    } catch {}
  };

  if (!ws) {
    return (
      <View style={s.root}>
        <Header title="Members" />
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>Household not found</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <Header title={`${ws.name} · Members`} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Invite code */}
        <Text style={s.section}>INVITE CODE</Text>
        <View style={s.card}>
          <View style={s.codeBox}>
            <Text style={s.code} testID="invite-code">{ws.invite_code || "—"}</Text>
            <Pressable testID="copy-code" onPress={copyCode} style={s.actionBtn}>
              <Icon name="Copy" size={18} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="share-code" onPress={shareCode} style={s.actionBtn}>
              <Icon name="ShareNetwork" size={18} color={colors.onSurface} />
            </Pressable>
          </View>
          <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 10 }}>
            Anyone with this code can join from their app: switcher → Join with code.
          </Text>
        </View>

        {/* Members */}
        <Text style={s.section}>MEMBERS</Text>
        <View style={s.card}>
          {ws.members.map((m) => {
            const isOwnerRow = m.role === "owner";
            const perm = isOwnerRow ? "full" : m.permission || "full";
            const permMeta = PERMS.find((p) => p.key === perm);
            return (
              <View key={m.member_id} style={s.row} testID={`member-${m.member_id}`}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.onSurface, fontFamily: fonts.displayBold, fontSize: 16 }}>{m.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.name, { flex: 0 }]}>{m.name}</Text>
                  <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2 }}>
                    {m.user_id ? (m.email || "Account linked") : "Placeholder · no account"}
                  </Text>
                </View>
                {isOwnerRow ? (
                  <View style={[s.badge, { backgroundColor: colors.brandTertiary }]}>
                    <Text style={[s.badgeText, { color: colors.onBrandTertiary }]}>OWNER</Text>
                  </View>
                ) : isOwner ? (
                  <>
                    <Pressable testID={`perm-${m.member_id}`} onPress={() => setPermFor(m)} style={[s.badge, { backgroundColor: colors.surfaceTertiary, flexDirection: "row", gap: 4, alignItems: "center" }]}>
                      <Text style={[s.badgeText, { color: colors.onSurfaceTertiary }]}>{permMeta?.label.toUpperCase()}</Text>
                      <Icon name="CaretDown" size={12} color={colors.muted} />
                    </Pressable>
                    <Pressable testID={`remove-${m.member_id}`} onPress={() => remove.mutate(m.member_id)} style={{ padding: 8 }}>
                      <Icon name="UserMinus" size={20} color={colors.error} />
                    </Pressable>
                  </>
                ) : (
                  <View style={[s.badge, { backgroundColor: colors.surfaceTertiary }]}>
                    <Text style={[s.badgeText, { color: colors.muted }]}>{permMeta?.label.toUpperCase()}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Invitations */}
        {isOwner && (
          <>
            <Text style={s.section}>INVITATIONS</Text>
            <View style={s.card}>
              <Button title="Invite by email" icon="EnvelopeSimple" testID="invite-by-email" variant="secondary" onPress={() => setInviteOpen(true)} />
              {(invites as any[]).length > 0 && <View style={{ height: 12 }} />}
              {(invites as any[]).map((inv) => {
                const stColor = inv.status === "pending" ? colors.warning : inv.status === "accepted" ? colors.success : colors.muted;
                return (
                  <View key={inv.id} style={s.inviteRow} testID={`invite-${inv.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.onSurface, fontFamily: fonts.textMedium, fontSize: 14 }}>{inv.email}</Text>
                      <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 11 }}>Sent {fmtFullDate(inv.created_at)}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: colors.surfaceTertiary }]}>
                      <Text style={[s.badgeText, { color: stColor }]}>{inv.status.toUpperCase()}</Text>
                    </View>
                    {inv.status === "pending" && (
                      <>
                        <Pressable testID={`resend-${inv.id}`} onPress={() => resend.mutate(inv.id)} style={{ padding: 8 }}>
                          <Icon name="EnvelopeSimple" size={18} color={colors.brandPrimary} />
                        </Pressable>
                        <Pressable testID={`revoke-${inv.id}`} onPress={() => revoke.mutate(inv.id)} style={{ padding: 8 }}>
                          <Icon name="X" size={18} color={colors.error} />
                        </Pressable>
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Invite by email */}
      <SheetModal visible={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite by email">
        <Field label="Email address" testID="invite-email" value={inviteEmail} onChangeText={setInviteEmail} placeholder="partner@example.com" keyboardType="email-address" autoFocus />
        <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, marginBottom: 14 }}>
          They'll get a single-use link and must sign in with this Google account.
        </Text>
        <Button title="Send invitation" testID="send-invite" loading={invite.isPending} disabled={!inviteEmail.includes("@")} onPress={() => invite.mutate()} />
      </SheetModal>

      {/* Permission picker */}
      <SheetModal visible={!!permFor} onClose={() => setPermFor(null)} title={`${permFor?.name || ""} · access`}>
        {PERMS.map((p) => {
          const active = (permFor?.permission || "full") === p.key;
          return (
            <Pressable
              key={p.key}
              testID={`perm-option-${p.key}`}
              onPress={() => setPerm.mutate({ memberId: permFor.member_id, permission: p.key })}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, marginBottom: 8, backgroundColor: active ? colors.surfaceTertiary : "transparent", borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border }}
            >
              <Icon name="ShieldCheck" size={20} color={active ? colors.brandPrimary : colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, fontFamily: fonts.textBold, fontSize: 15 }}>{p.label}</Text>
                <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12 }}>{p.desc}</Text>
              </View>
              {active ? <Icon name="Check" size={20} color={colors.brandPrimary} weight="bold" /> : null}
            </Pressable>
          );
        })}
      </SheetModal>
    </View>
  );
}
