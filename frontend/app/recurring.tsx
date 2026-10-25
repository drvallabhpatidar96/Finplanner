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
import { Select } from "@/src/components/select";
import { SheetModal } from "@/src/components/sheet-modal";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginHorizontal: 16, marginTop: 12, backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  name: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 15 },
  sub: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  amt: { fontFamily: fonts.displayBold, fontSize: 20 },
}));

const FREQ = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

export default function Recurring() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { current, currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const base = current?.base_currency || "INR";

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [type, setType] = useState<"expense" | "income">("expense");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState("monthly");
  const [nextDate, setNextDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const { data: recurring = [] } = useQuery({ queryKey: ["recurring", currentId], queryFn: () => api(`/recurring?workspace_id=${currentId}`), enabled: !!currentId });
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts", currentId], queryFn: () => api(`/accounts?workspace_id=${currentId}`), enabled: !!currentId });
  const { data: categories = [] } = useQuery({ queryKey: ["categories", currentId], queryFn: () => api(`/categories?workspace_id=${currentId}`), enabled: !!currentId });

  const body = () => ({ workspace_id: currentId, type, account_id: accountId, category_id: categoryId, amount: parseFloat(amount) || 0, currency: base, note, frequency: freq, next_date: nextDate });
  const save = useMutation({
    mutationFn: () => editId ? api(`/recurring/${editId}`, { method: "PUT", body: body() }) : api("/recurring", { method: "POST", body: body() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring", currentId] });
      qc.invalidateQueries({ queryKey: ["dashboard", currentId] });
      setOpen(false); setAmount(""); setNote("");
      toast.show(editId ? "Updated" : "Recurring rule added", "success");
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/recurring/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recurring", currentId] }); qc.invalidateQueries({ queryKey: ["dashboard", currentId] }); },
  });

  const openNew = () => { setEditId(null); setType("expense"); setAccountId(null); setCategoryId(null); setAmount(""); setFreq("monthly"); setNextDate(new Date().toISOString().slice(0, 10)); setNote(""); setOpen(true); };
  const openEdit = (r: any) => { setEditId(r.id); setType(r.type); setAccountId(r.account_id); setCategoryId(r.category_id); setAmount(String(r.amount)); setFreq(r.frequency); setNextDate(r.next_date); setNote(r.note || ""); setOpen(true); };

  return (
    <View style={s.root}>
      <Header title="Recurring" right={<Pressable testID="recurring-add" onPress={openNew} style={{ padding: 8 }}><Icon name="Plus" size={24} color={colors.brandPrimary} weight="bold" /></Pressable>} />
      {(recurring as any[]).length === 0 ? (
        <EmptyState icon="Repeat" title="No recurring items" subtitle="Add rent, salary or subscriptions that repeat.">
          <Button title="Add Recurring" icon="Plus" onPress={openNew} />
        </EmptyState>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {(recurring as any[]).map((r) => (
            <Pressable key={r.id} style={s.row} testID={`recurring-${r.id}`} onPress={() => openEdit(r)} onLongPress={() => del.mutate(r.id)}>
              <Icon name="Repeat" size={22} color={r.type === "income" ? colors.success : colors.brandPrimary} weight="bold" />
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{r.note || r.type}</Text>
                <Text style={s.sub}>{r.frequency} · next {fmtFullDate(r.next_date)}</Text>
              </View>
              <Text style={[s.amt, { color: r.type === "income" ? colors.success : colors.onSurface }]}>{money(r.amount, r.currency, true)}</Text>
            </Pressable>
          ))}
          <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: 16 }}>Tap to edit · long-press to remove</Text>
        </ScrollView>
      )}

      <SheetModal visible={open} onClose={() => setOpen(false)} title={editId ? "Edit recurring" : "New recurring"}>
        <Select label="Type" testID="rec-type" value={type} options={[{ label: "Expense", value: "expense" }, { label: "Income", value: "income" }]} onChange={(v) => setType(v as any)} />
        <Select label="Account" testID="rec-account" value={accountId} options={(accounts as any[]).map((a) => ({ label: a.name, value: a.id }))} onChange={setAccountId} />
        <Select label="Category" testID="rec-category" value={categoryId} options={(categories as any[]).filter((c) => c.kind === type).map((c) => ({ label: c.name, value: c.id, color: c.color }))} onChange={setCategoryId} />
        <Field label={`Amount (${base})`} testID="rec-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <Select label="Frequency" testID="rec-freq" value={freq} options={FREQ} onChange={setFreq} />
        <Field label="Next date (YYYY-MM-DD)" testID="rec-date" value={nextDate} onChangeText={setNextDate} />
        <Field label="Note" testID="rec-note" value={note} onChangeText={setNote} placeholder="e.g. Rent" />
        <Button title={editId ? "Save" : "Add"} testID="rec-save" loading={save.isPending} disabled={!accountId || !amount} onPress={() => save.mutate()} />
      </SheetModal>
    </View>
  );
}
