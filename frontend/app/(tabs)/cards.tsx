import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { usesNativeTabs } from "@/src/navigation";
import { money, fmtFullDate } from "@/src/format";
import { Icon } from "@/src/components/icon";
import { Button, EmptyState } from "@/src/components/ui";
import { Field } from "@/src/components/ui";
import { Select } from "@/src/components/select";
import { SheetModal } from "@/src/components/sheet-modal";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.surface, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: c.divider },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 28 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 18, padding: 18, marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderColor: c.border },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardName: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 18 },
  stmtLabel: { color: c.muted, fontFamily: fonts.textMedium, fontSize: 12, marginTop: 14 },
  stmtVal: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 44 },
  gridRow: { flexDirection: "row", marginTop: 16, gap: 10 },
  gridItem: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 12 },
  gridLabel: { color: c.muted, fontFamily: fonts.text, fontSize: 11 },
  gridVal: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 15, marginTop: 3 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22, marginBottom: 12 },
}));

export default function Cards() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { current, currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const [payCard, setPayCard] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payFrom, setPayFrom] = useState<string | null>(null);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["credit-cards", currentId],
    queryFn: () => api(`/credit-cards?workspace_id=${currentId}`),
    enabled: !!currentId,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", currentId],
    queryFn: () => api(`/accounts?workspace_id=${currentId}`),
    enabled: !!currentId,
  });

  const payAccounts = (accounts as any[]).filter((a) => a.type !== "credit_card");
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const pay = useMutation({
    mutationFn: () =>
      api("/credit-cards/payment", {
        method: "POST",
        body: {
          workspace_id: currentId,
          account_id: payCard.id,
          amount: parseFloat(payAmount) || 0,
          date: new Date().toISOString().slice(0, 10),
          from_account_id: payFrom,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credit-cards", currentId] });
      qc.invalidateQueries({ queryKey: ["accounts", currentId] });
      qc.invalidateQueries({ queryKey: ["dashboard", currentId] });
      setPayCard(null);
      setPayAmount("");
      toast.show("Payment recorded", "success");
    },
    onError: (e: any) => toast.show(e.message || "Failed", "error"),
  });

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Text style={s.title}>Cards</Text>
        <Pressable style={s.addBtn} testID="add-card-btn" onPress={() => router.push("/add-account?type=credit_card")}>
          <Icon name="Plus" size={22} color={colors.brandPrimary} weight="bold" />
        </Pressable>
      </View>

      {!currentId || isLoading ? (
        <View style={{ paddingTop: 80, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (cards as any[]).length === 0 ? (
        <EmptyState icon="CreditCard" title="No credit cards" subtitle="Add a credit card to track spends, statements and dues.">
          <Button title="Add Card" icon="Plus" testID="empty-add-card" onPress={() => router.push("/add-account?type=credit_card")} />
        </EmptyState>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: bottomChrome + 24 }} showsVerticalScrollIndicator={false}>
          {(cards as any[]).map((c) => (
            <View key={c.id} style={s.card} testID={`card-${c.id}`}>
              <View style={s.cardTop}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Icon name="CreditCard" size={24} color={colors.brandPrimary} weight="fill" />
                  <Text style={s.cardName}>{c.name}</Text>
                </View>
                <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12 }}>{c.currency}</Text>
              </View>

              <Text style={s.stmtLabel}>CURRENT STATEMENT BALANCE</Text>
              <Text style={s.stmtVal}>{money(c.statement_balance, c.currency, true)}</Text>

              <View style={s.gridRow}>
                <View style={s.gridItem}>
                  <Text style={s.gridLabel}>Minimum due</Text>
                  <Text style={[s.gridVal, { color: colors.warning }]}>{money(c.minimum_due, c.currency, true)}</Text>
                </View>
                <View style={s.gridItem}>
                  <Text style={s.gridLabel}>Unbilled</Text>
                  <Text style={s.gridVal}>{money(c.unbilled, c.currency, true)}</Text>
                </View>
              </View>
              <View style={s.gridRow}>
                <View style={s.gridItem}>
                  <Text style={s.gridLabel}>Revolving est. / mo</Text>
                  <Text style={s.gridVal}>{money(c.revolving_estimate, c.currency, true)}</Text>
                </View>
                <View style={s.gridItem}>
                  <Text style={s.gridLabel}>Available credit</Text>
                  <Text style={[s.gridVal, { color: colors.success }]}>{money(c.available_credit, c.currency, true)}</Text>
                </View>
              </View>

              <Text style={[s.gridLabel, { marginTop: 14 }]}>Due date · {fmtFullDate(c.due_date)}</Text>

              <Button
                title="Make payment"
                icon="ArrowUp"
                variant="secondary"
                testID={`pay-card-${c.id}`}
                style={{ marginTop: 14 }}
                onPress={() => {
                  setPayCard(c);
                  setPayFrom(payAccounts[0]?.id || null);
                  setPayAmount(String(c.statement_balance || ""));
                }}
              />
            </View>
          ))}
        </ScrollView>
      )}

      <SheetModal visible={!!payCard} onClose={() => setPayCard(null)} title={`Pay ${payCard?.name || ""}`}>
        <Field label="Amount" testID="pay-amount" value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <Select
          label="From account"
          testID="pay-from"
          value={payFrom}
          options={payAccounts.map((a) => ({ label: a.name, value: a.id, sublabel: money(a.balance, a.currency, true) }))}
          onChange={setPayFrom}
        />
        <Button title="Record payment" testID="confirm-payment" loading={pay.isPending} onPress={() => pay.mutate()} />
      </SheetModal>
    </View>
  );
}
