import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useWorkspace } from "@/src/workspace";
import { money, symbol } from "@/src/format";
import { Keypad } from "@/src/components/keypad";
import { Icon } from "@/src/components/icon";
import { Button, Field, ToggleRow } from "@/src/components/ui";
import { Select } from "@/src/components/select";
import { useToast } from "@/src/components/toast";

const TYPES = [
  { key: "expense", label: "Expense", color: "brandPrimary" },
  { key: "income", label: "Income", color: "success" },
  { key: "transfer", label: "Transfer", color: "info" },
] as const;

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CHF"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  topRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 6 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, textAlign: "center", color: c.onSurface, fontFamily: fonts.textBold, fontSize: 16 },
  typeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 4 },
  typeBtn: { flex: 1, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  typeText: { fontFamily: fonts.textBold, fontSize: 14 },
  amountWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 20 },
  curPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.surfaceSecondary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
  amount: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 64, lineHeight: 70 },
  keypadWrap: { paddingHorizontal: 24 },
  detailHead: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 26, paddingHorizontal: 16, marginBottom: 4 },
  detailSub: { color: c.muted, fontFamily: fonts.text, fontSize: 14, paddingHorizontal: 16, marginBottom: 16 },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  splitName: { flex: 1, color: c.onSurfaceSecondary, fontFamily: fonts.textMedium, fontSize: 14 },
  splitInput: { width: 120, backgroundColor: c.surfaceTertiary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: c.onSurface, fontFamily: fonts.text, borderWidth: 1, borderColor: c.border, textAlign: "right" },
}));

export default function AddTransaction() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { current, currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string; amount?: string; note?: string; date?: string; currency?: string }>();
  const editing = !!params.id;

  const [stage, setStage] = useState<"amount" | "details">("amount");
  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [amount, setAmount] = useState(params.amount && parseFloat(params.amount) > 0 ? String(parseFloat(params.amount)) : "0");
  const [currency, setCurrency] = useState(params.currency || current?.base_currency || "INR");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState(params.note || "");
  const [date, setDate] = useState(params.date || new Date().toISOString().slice(0, 10));
  const [isRefund, setIsRefund] = useState(false);
  const [payerId, setPayerId] = useState<string | null>(null);
  const [splitOn, setSplitOn] = useState(false);
  const [splits, setSplits] = useState<Record<string, string>>({});

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", currentId],
    queryFn: () => api(`/accounts?workspace_id=${currentId}`),
    enabled: !!currentId,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", currentId],
    queryFn: () => api(`/categories?workspace_id=${currentId}`),
    enabled: !!currentId,
  });

  const { data: editTxn } = useQuery({
    queryKey: ["txn", params.id],
    queryFn: () => api(`/transactions/${params.id}`),
    enabled: editing,
  });

  React.useEffect(() => {
    if (!editTxn) return;
    setType((editTxn as any).type);
    setAmount(String((editTxn as any).amount));
    setCurrency((editTxn as any).currency);
    setAccountId((editTxn as any).account_id);
    setToAccountId((editTxn as any).to_account_id || null);
    setCategoryId((editTxn as any).category_id || null);
    setNote((editTxn as any).note || "");
    setDate((editTxn as any).date);
    setIsRefund(!!(editTxn as any).is_refund);
    setPayerId((editTxn as any).payer_member_id || null);
    const sp = (editTxn as any).splits || [];
    if (sp.length) {
      setSplitOn(true);
      const next: Record<string, string> = {};
      sp.forEach((x: any) => (next[x.member_id] = String(x.share_amount)));
      setSplits(next);
    }
  }, [editTxn]);

  const isShared = current?.type === "shared";
  const members = current?.members || [];
  const numAmount = parseFloat(amount) || 0;

  const catOptions = useMemo(
    () => (categories as any[])
      .filter((c) => c.kind === (type === "income" ? "income" : "expense"))
      .map((c) => ({ label: c.name, value: c.id, color: c.color })),
    [categories, type]
  );
  const accOptions = (accounts as any[]).map((a) => ({
    label: a.name, value: a.id, sublabel: `${a.type.replace("_", " ")} · ${money(a.balance, a.currency, true)}`,
  }));

  const save = useMutation({
    mutationFn: () => {
      const splitArr = isShared && splitOn
        ? members.map((m) => ({ member_id: m.member_id, share_amount: parseFloat(splits[m.member_id] || "0") || 0 }))
            .filter((x) => x.share_amount > 0)
        : [];
      return api(editing ? `/transactions/${params.id}` : "/transactions", {
        method: editing ? "PUT" : "POST",
        body: {
          workspace_id: currentId,
          type,
          account_id: accountId,
          to_account_id: type === "transfer" ? toAccountId : null,
          category_id: type === "transfer" ? null : categoryId,
          amount: numAmount,
          currency,
          date,
          note,
          payer_member_id: isShared && type === "expense" ? payerId : null,
          splits: splitArr,
          is_refund: type === "expense" ? isRefund : false,
        },
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["dashboard", currentId] });
      qc.invalidateQueries({ queryKey: ["transactions", currentId] });
      qc.invalidateQueries({ queryKey: ["accounts", currentId] });
      qc.invalidateQueries({ queryKey: ["budgets", currentId] });
      qc.invalidateQueries({ queryKey: ["credit-cards", currentId] });
      toast.show("Transaction saved", "success");
      router.back();
    },
    onError: (e: any) => toast.show(e.message || "Could not save", "error"),
  });

  const goDetails = () => {
    if (numAmount <= 0) {
      toast.show("Enter an amount first", "error");
      return;
    }
    if (!payerId && isShared) {
      const self = members.find((m) => m.user_id === user?.user_id);
      setPayerId(self?.member_id || members[0]?.member_id || null);
    }
    setStage("details");
  };

  const canSave = type === "transfer" ? !!accountId && !!toAccountId && accountId !== toAccountId : !!accountId;

  const splitEqually = () => {
    const n = members.length || 1;
    const each = (numAmount / n).toFixed(2);
    const next: Record<string, string> = {};
    members.forEach((m) => (next[m.member_id] = each));
    setSplits(next);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 4 }]}>
      <View style={s.topRow}>
        <Pressable
          style={s.closeBtn}
          testID="add-txn-close"
          onPress={() => (stage === "details" ? setStage("amount") : router.back())}
        >
          <Icon name={stage === "details" ? "ArrowLeft" : "X"} size={24} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={s.topTitle}>{stage === "amount" ? (editing ? "Edit Transaction" : "New Transaction") : "Details"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {stage === "amount" ? (
        <View style={{ flex: 1, justifyContent: "space-between", paddingBottom: insets.bottom + 12 }}>
          <View>
            <View style={s.typeRow}>
              {TYPES.map((t) => {
                const active = type === t.key;
                const col = (colors as any)[t.color];
                return (
                  <Pressable
                    key={t.key}
                    testID={`type-${t.key}`}
                    style={[s.typeBtn, { borderColor: active ? col : colors.border, backgroundColor: active ? col : "transparent" }]}
                    onPress={() => {
                      setType(t.key);
                      setCategoryId(null);
                    }}
                  >
                    <Text style={[s.typeText, { color: active ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={s.amountWrap}>
              <Select
                testID="currency-pill"
                value={currency}
                options={CURRENCIES.map((c) => ({ label: `${symbol(c).trim()} ${c}`, value: c }))}
                onChange={setCurrency}
              />
              <Text style={s.amount} testID="amount-display">{symbol(currency)}{amount}</Text>
            </View>
          </View>

          <View>
            <View style={s.keypadWrap}>
              <Keypad value={amount} onChange={setAmount} />
            </View>
            <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
              <Button title="Next" icon="CaretRight" testID="amount-next" onPress={goDetails} />
            </View>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled">
          <Text style={s.detailHead}>{money(numAmount, currency)}</Text>
          <Text style={s.detailSub}>{TYPES.find((t) => t.key === type)?.label}</Text>

          <View style={{ paddingHorizontal: 16 }}>
            <Select
              label={type === "transfer" ? "From account" : "Account"}
              testID="account-select"
              placeholder="Choose account"
              value={accountId}
              options={accOptions}
              onChange={setAccountId}
            />
            {type === "transfer" && (
              <Select
                label="To account"
                testID="to-account-select"
                placeholder="Choose destination"
                value={toAccountId}
                options={accOptions}
                onChange={setToAccountId}
              />
            )}
            {type !== "transfer" && (
              <Select
                label="Category"
                testID="category-select"
                placeholder="Choose category"
                value={categoryId}
                options={catOptions}
                onChange={setCategoryId}
              />
            )}

            {isShared && type === "expense" && (
              <Select
                label="Paid by"
                testID="payer-select"
                value={payerId}
                options={members.map((m) => ({ label: m.name, value: m.member_id }))}
                onChange={setPayerId}
              />
            )}

            <Field label="Note" testID="note-field" value={note} onChangeText={setNote} placeholder="Optional note" />
            <Field label="Date (YYYY-MM-DD)" testID="date-field" value={date} onChangeText={setDate} placeholder="2026-06-01" />

            {type === "expense" && (
              <ToggleRow
                testID="refund-toggle"
                title="Mark as refund"
                subtitle="Adds money back to the account"
                active={isRefund}
                onPress={() => setIsRefund((v) => !v)}
              />
            )}

            {isShared && type === "expense" && (
              <>
                <ToggleRow
                  testID="split-toggle"
                  title="Split allocation"
                  subtitle="Assign each member's share"
                  active={splitOn}
                  onPress={() => setSplitOn((v) => !v)}
                />
                {splitOn && (
                  <View style={{ marginBottom: 14 }}>
                    <Pressable onPress={splitEqually} testID="split-equally" style={{ alignSelf: "flex-end", marginBottom: 10 }}>
                      <Text style={{ color: colors.brandPrimary, fontFamily: fonts.textBold, fontSize: 13 }}>Split equally</Text>
                    </Pressable>
                    {members.map((m) => (
                      <View key={m.member_id} style={s.splitRow}>
                        <Text style={s.splitName}>{m.name}</Text>
                        <Field
                          value={splits[m.member_id] || ""}
                          onChangeText={(t) => setSplits((p) => ({ ...p, [m.member_id]: t }))}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          style={{ textAlign: "right" }}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            <Button
              title="Save transaction"
              icon="Check"
              testID="save-transaction"
              loading={save.isPending}
              disabled={!canSave}
              onPress={() => save.mutate()}
              style={{ marginTop: 8 }}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}
