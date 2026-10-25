import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { Header } from "@/src/components/header";
import { Icon } from "@/src/components/icon";
import { Button, Field } from "@/src/components/ui";
import { Select } from "@/src/components/select";
import { SheetModal } from "@/src/components/sheet-modal";
import { useToast } from "@/src/components/toast";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CHF"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  card: { padding: 16, marginHorizontal: 16, marginTop: 12, backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 17, flex: 1 },
  tag: { fontSize: 10, fontFamily: fonts.textMedium, letterSpacing: 0.6, marginTop: 2 },
  memberChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surfaceTertiary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22, marginBottom: 12 },
}));

export default function Workspaces() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { workspaces, currentId, setCurrentId, refetch } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [memberFor, setMemberFor] = useState<any>(null);
  const [memberName, setMemberName] = useState("");

  const create = useMutation({
    mutationFn: () => api("/workspaces", { method: "POST", body: { name, base_currency: currency } }),
    onSuccess: (ws: any) => { refetch(); setCreateOpen(false); setName(""); setCurrentId(ws.id); toast.show("Household created", "success"); },
  });
  const addMember = useMutation({
    mutationFn: () => api(`/workspaces/${memberFor.id}/members`, { method: "POST", body: { name: memberName } }),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["dashboard", memberFor.id] }); setMemberName(""); setMemberFor(null); toast.show("Member added", "success"); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${id}`, { method: "DELETE" }),
    onSuccess: () => { refetch(); toast.show("Household deleted", "success"); },
  });

  return (
    <View style={s.root}>
      <Header title="Households" right={<Pressable testID="ws-create" onPress={() => setCreateOpen(true)} style={{ padding: 8 }}><Icon name="Plus" size={24} color={colors.brandPrimary} weight="bold" /></Pressable>} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {workspaces.map((w) => {
          const shared = w.type === "shared";
          const accent = shared ? colors.brandSecondary : colors.success;
          return (
            <Pressable key={w.id} style={s.card} testID={`ws-card-${w.id}`} onPress={() => setCurrentId(w.id)}>
              <View style={s.topRow}>
                <View style={[s.dot, { backgroundColor: accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{w.name}</Text>
                  <Text style={[s.tag, { color: accent }]}>{shared ? "SHARED HOUSEHOLD" : "PERSONAL"} · {w.base_currency}</Text>
                </View>
                {currentId === w.id ? <Icon name="CheckCircle" size={22} color={colors.brandPrimary} weight="fill" /> : null}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {w.members.map((m) => (
                  <View key={m.member_id} style={s.memberChip}>
                    <Icon name="Users" size={12} color={colors.muted} />
                    <Text style={{ color: colors.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 12 }}>{m.name}</Text>
                  </View>
                ))}
              </View>
              {shared && (
                <>
                  <Button
                    title="Members & invites"
                    icon="Users"
                    testID={`ws-manage-${w.id}`}
                    style={{ marginTop: 14 }}
                    onPress={() => router.push(`/members?id=${w.id}`)}
                  />
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Button title="Add placeholder" variant="secondary" icon="Plus" testID={`ws-addmember-${w.id}`} style={{ flex: 1 }} onPress={() => setMemberFor(w)} />
                    <Button title="Delete" variant="danger" icon="Trash" testID={`ws-delete-${w.id}`} onPress={() => del.mutate(w.id)} />
                  </View>
                </>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <SheetModal visible={createOpen} onClose={() => setCreateOpen(false)} title="New household">
        <Field label="Name" testID="ws-name" value={name} onChangeText={setName} placeholder="e.g. Home" autoFocus />
        <Select label="Base currency" testID="ws-currency" value={currency} options={CURRENCIES.map((c) => ({ label: c, value: c }))} onChange={setCurrency} />
        <Button title="Create" testID="ws-create-save" loading={create.isPending} disabled={!name} onPress={() => create.mutate()} />
      </SheetModal>

      <SheetModal visible={!!memberFor} onClose={() => setMemberFor(null)} title={`Add member to ${memberFor?.name || ""}`}>
        <Field label="Member name" testID="member-name" value={memberName} onChangeText={setMemberName} placeholder="e.g. Priya" autoFocus />
        <Button title="Add" testID="member-save" loading={addMember.isPending} disabled={!memberName} onPress={() => addMember.mutate()} />
      </SheetModal>
    </View>
  );
}
