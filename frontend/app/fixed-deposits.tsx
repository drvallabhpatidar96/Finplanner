import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { money, fmtFullDate } from "@/src/format";
import { Header } from "@/src/components/header";
import { Icon } from "@/src/components/icon";
import { Button, EmptyState, Field } from "@/src/components/ui";
import { SheetModal } from "@/src/components/sheet-modal";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  card: { padding: 16, marginHorizontal: 16, marginTop: 12, backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  name: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 16 },
  big: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 28, marginTop: 6 },
  gridRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  gridItem: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 12 },
  gridLabel: { color: c.muted, fontFamily: fonts.text, fontSize: 11 },
  gridVal: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 15, marginTop: 3 },
}));

export default function FixedDeposits() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { current, currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const base = current?.base_currency || "INR";

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [maturity, setMaturity] = useState("");
  const [ownership, setOwnership] = useState<Record<string, string>>({});

  const isShared = current?.type === "shared";
  const members = current?.members || [];

  const { data: fds = [] } = useQuery({ queryKey: ["fds", currentId], queryFn: () => api(`/fixed-deposits?workspace_id=${currentId}`), enabled: !!currentId });

  const body = () => ({
    workspace_id: currentId, name, principal: parseFloat(principal) || 0, rate: parseFloat(rate) || 0,
    currency: base, start_date: start, maturity_date: maturity,
    ownership: isShared ? members.map((m) => ({ member_id: m.member_id, percent: parseFloat(ownership[m.member_id] || "0") || 0 })).filter((o) => o.percent > 0) : [],
  });
  const save = useMutation({
    mutationFn: () => editId ? api(`/fixed-deposits/${editId}`, { method: "PUT", body: body() }) : api("/fixed-deposits", { method: "POST", body: body() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fds", currentId] }); setOpen(false); toast.show(editId ? "Updated" : "FD added", "success"); },
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/fixed-deposits/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["fds", currentId] }) });

  const openNew = () => { setEditId(null); setName(""); setPrincipal(""); setRate(""); setStart(new Date().toISOString().slice(0, 10)); setMaturity(""); setOwnership({}); setOpen(true); };
  const openEdit = (f: any) => {
    setEditId(f.id); setName(f.name); setPrincipal(String(f.principal)); setRate(String(f.rate)); setStart(f.start_date); setMaturity(f.maturity_date);
    const o: Record<string, string> = {};
    (f.ownership || []).forEach((x: any) => (o[x.member_id] = String(x.percent)));
    setOwnership(o);
    setOpen(true);
  };
  const evenSplit = () => {
    const n = members.length || 1;
    const each = (100 / n).toFixed(2);
    const next: Record<string, string> = {};
    members.forEach((m) => (next[m.member_id] = each));
    setOwnership(next);
  };

  return (
    <View style={s.root}>
      <Header title="Fixed Deposits" right={<Pressable testID="fd-add" onPress={openNew} style={{ padding: 8 }}><Icon name="Plus" size={24} color={colors.brandPrimary} weight="bold" /></Pressable>} />
      {(fds as any[]).length === 0 ? (
        <EmptyState icon="Bank" title="No fixed deposits" subtitle="Track FDs with accrued interest and maturity value.">
          <Button title="Add FD" icon="Plus" onPress={openNew} />
        </EmptyState>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {(fds as any[]).map((f) => (
            <Pressable key={f.id} style={s.card} testID={`fd-${f.id}`} onPress={() => openEdit(f)} onLongPress={() => del.mutate(f.id)}>
              <Text style={s.name}>{f.name}</Text>
              <Text style={s.big}>{money(f.principal, f.currency, true)}</Text>
              <Text style={s.gridLabel}>@ {f.rate}% · matures {fmtFullDate(f.maturity_date)}</Text>
              {isShared && f.my_share !== undefined && (
                <Text style={{ color: colors.brandSecondary, fontFamily: fonts.textMedium, fontSize: 12, marginTop: 4 }}>
                  Your share: {money(f.my_share, f.currency, true)}
                </Text>
              )}
              <View style={s.gridRow}>
                <View style={s.gridItem}>
                  <Text style={s.gridLabel}>Accrued interest</Text>
                  <Text style={[s.gridVal, { color: colors.success }]}>{money(f.accrued_interest, f.currency, true)}</Text>
                </View>
                <View style={s.gridItem}>
                  <Text style={s.gridLabel}>Maturity value</Text>
                  <Text style={s.gridVal}>{money(f.maturity_value, f.currency, true)}</Text>
                </View>
              </View>
            </Pressable>
          ))}
          <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: 16 }}>Tap to edit · long-press to remove</Text>
        </ScrollView>
      )}

      <SheetModal visible={open} onClose={() => setOpen(false)} title={editId ? "Edit fixed deposit" : "New fixed deposit"}>
        <Field label="Name" testID="fd-name" value={name} onChangeText={setName} placeholder="e.g. SBI FD" />
        <Field label={`Principal (${base})`} testID="fd-principal" value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" placeholder="100000" />
        <Field label="Interest rate %" testID="fd-rate" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="7.1" />
        <Field label="Start date (YYYY-MM-DD)" testID="fd-start" value={start} onChangeText={setStart} />
        <Field label="Maturity date (YYYY-MM-DD)" testID="fd-maturity" value={maturity} onChangeText={setMaturity} placeholder="2027-06-01" />
        {isShared && (
          <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ color: colors.onSurfaceTertiary, fontFamily: fonts.textMedium, fontSize: 13 }}>Ownership %</Text>
              <Pressable testID="ownership-even" onPress={evenSplit}>
                <Text style={{ color: colors.brandPrimary, fontFamily: fonts.textBold, fontSize: 13 }}>Even split</Text>
              </Pressable>
            </View>
            {members.map((m) => (
              <View key={m.member_id} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Text style={{ flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.textMedium, fontSize: 14 }}>{m.name}</Text>
                <View style={{ width: 90 }}>
                  <Field value={ownership[m.member_id] || ""} onChangeText={(t) => setOwnership((p) => ({ ...p, [m.member_id]: t }))} placeholder="0" keyboardType="decimal-pad" style={{ textAlign: "right", paddingVertical: 10 }} />
                </View>
              </View>
            ))}
            <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 11 }}>Must add up to 100% if set.</Text>
          </View>
        )}
        <Button title={editId ? "Save" : "Add"} testID="fd-save" loading={save.isPending} disabled={!name || !principal} onPress={() => save.mutate()} />
      </SheetModal>
    </View>
  );
}
