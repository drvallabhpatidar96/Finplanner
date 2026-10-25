import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { money } from "@/src/format";
import { Header } from "@/src/components/header";
import { Icon } from "@/src/components/icon";
import { Button, EmptyState, Field } from "@/src/components/ui";
import { Select } from "@/src/components/select";
import { SheetModal } from "@/src/components/sheet-modal";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  alert: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: c.brandTertiary },
  alertText: { color: c.onBrandTertiary, fontFamily: fonts.textMedium, fontSize: 13, flex: 1 },
  card: { padding: 16, marginHorizontal: 16, marginTop: 12, backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  name: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 16 },
  amt: { color: c.onSurfaceSecondary, fontFamily: fonts.textMedium, fontSize: 13 },
  barBg: { height: 10, borderRadius: 5, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
}));

export default function Budgets() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { current, currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const base = current?.base_currency || "INR";

  const [open, setOpen] = useState(false);
  const [catId, setCatId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["budgets", currentId],
    queryFn: () => api(`/budgets?workspace_id=${currentId}`),
    enabled: !!currentId,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", currentId],
    queryFn: () => api(`/categories?workspace_id=${currentId}`),
    enabled: !!currentId,
  });
  const catMap = Object.fromEntries((categories as any[]).map((c) => [c.id, c]));
  const expenseCats = (categories as any[]).filter((c) => c.kind === "expense");

  const alerts = (budgets as any[]).filter((b) => b.amount > 0 && b.spent >= b.amount * 0.8);

  const save = useMutation({
    mutationFn: () => api("/budgets", { method: "POST", body: { workspace_id: currentId, category_id: catId, amount: parseFloat(amount) || 0 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets", currentId] });
      setOpen(false); setAmount(""); setCatId(null);
      toast.show("Budget saved", "success");
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/budgets/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["budgets", currentId] }); toast.show("Removed", "success"); },
  });

  const openEdit = (b: any) => { setCatId(b.category_id); setAmount(String(b.amount)); setOpen(true); };
  const openNew = () => { setCatId(null); setAmount(""); setOpen(true); };

  return (
    <View style={s.root}>
      <Header title="Budgets" right={<Pressable testID="budget-add" onPress={openNew} style={{ padding: 8 }}><Icon name="Plus" size={24} color={colors.brandPrimary} weight="bold" /></Pressable>} />
      {!currentId || isLoading ? (
        <View style={{ paddingTop: 80, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (budgets as any[]).length === 0 ? (
        <EmptyState icon="Target" title="No budgets" subtitle="Set monthly limits per category to stay on track.">
          <Button title="Add Budget" icon="Plus" onPress={openNew} />
        </EmptyState>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {alerts.length > 0 && (
            <View style={s.alert} testID="budget-alert">
              <Icon name="WarningCircle" size={20} color={colors.warning} weight="fill" />
              <Text style={s.alertText}>
                {alerts.length} budget{alerts.length > 1 ? "s" : ""} near or over the monthly limit.
              </Text>
            </View>
          )}
          {(budgets as any[]).map((b) => {
            const cat = catMap[b.category_id];
            const pct = Math.min(100, (b.spent / (b.amount || 1)) * 100);
            const over = b.spent > b.amount;
            const near = !over && b.spent >= b.amount * 0.8;
            return (
              <Pressable key={b.id} style={s.card} testID={`budget-${b.id}`} onPress={() => openEdit(b)} onLongPress={() => del.mutate(b.id)}>
                <View style={s.topRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat?.color || colors.brandPrimary }} />
                    <Text style={s.name}>{cat?.name || "Category"}</Text>
                  </View>
                  <Text style={s.amt}>{money(b.spent, base, true)} / {money(b.amount, base, true)}</Text>
                </View>
                <View style={s.barBg}>
                  <View style={{ height: 10, borderRadius: 5, width: `${Math.max(4, pct)}%`, backgroundColor: over ? colors.error : near ? colors.warning : cat?.color || colors.brandPrimary }} />
                </View>
                {over ? <Text style={{ color: colors.error, fontFamily: fonts.textMedium, fontSize: 12, marginTop: 6 }}>Over budget by {money(b.spent - b.amount, base, true)}</Text>
                  : near ? <Text style={{ color: colors.warning, fontFamily: fonts.textMedium, fontSize: 12, marginTop: 6 }}>{Math.round(pct)}% used — nearing limit</Text> : null}
              </Pressable>
            );
          })}
          <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: 16 }}>Tap to edit · long-press to remove</Text>
        </ScrollView>
      )}

      <SheetModal visible={open} onClose={() => setOpen(false)} title="Set budget">
        <Select label="Category" testID="budget-category" value={catId} options={expenseCats.map((c) => ({ label: c.name, value: c.id, color: c.color }))} onChange={setCatId} />
        <Field label={`Monthly limit (${base})`} testID="budget-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <Button title="Save" testID="budget-save" loading={save.isPending} disabled={!catId || !amount} onPress={() => save.mutate()} />
      </SheetModal>
    </View>
  );
}
