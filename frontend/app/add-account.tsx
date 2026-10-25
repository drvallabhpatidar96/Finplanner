import React, { useEffect, useState } from "react";
import { View, ScrollView, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";

import { makeStyles, fonts } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { useResponsive } from "@/src/responsive";
import { Header } from "@/src/components/header";
import { Button, Field } from "@/src/components/ui";
import { Select } from "@/src/components/select";
import { useToast } from "@/src/components/toast";

const TYPES = [
  { label: "Bank account", value: "bank" },
  { label: "Cash", value: "cash" },
  { label: "Credit card", value: "credit_card" },
  { label: "Loan", value: "loan" },
  { label: "Overdraft", value: "overdraft" },
];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CHF"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  sectionLabel: { color: c.muted, fontFamily: fonts.textMedium, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 20, marginBottom: 8 },
  sectionBox: { backgroundColor: c.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 4 },
  sectionNote: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 8 },
}));

export default function AddAccount() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const editing = !!params.id;
  const { current, currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [type, setType] = useState<string>(params.type || "bank");
  const [currency, setCurrency] = useState(current?.base_currency || "INR");
  const [opening, setOpening] = useState("");
  // credit card
  const [limit, setLimit] = useState("");
  const [stmtDay, setStmtDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  // loan
  const [lender, setLender] = useState("");
  const [rate, setRate] = useState("");
  const [tenure, setTenure] = useState("");
  const [emi, setEmi] = useState("");
  // overdraft
  const [odLimit, setOdLimit] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", currentId],
    queryFn: () => api(`/accounts?workspace_id=${currentId}`),
    enabled: !!currentId && editing,
  });

  useEffect(() => {
    if (!editing) return;
    const a = (accounts as any[]).find((x) => x.id === params.id);
    if (a) {
      setName(a.name); setType(a.type); setCurrency(a.currency);
      setOpening(String(a.opening_balance ?? ""));
      setLimit(a.credit_limit != null ? String(a.credit_limit) : "");
      setStmtDay(a.statement_day != null ? String(a.statement_day) : "");
      setDueDay(a.due_day != null ? String(a.due_day) : "");
      setLender(a.lender_name || "");
      setRate(a.interest_rate != null ? String(a.interest_rate) : "");
      setTenure(a.tenure_months != null ? String(a.tenure_months) : "");
      setEmi(a.emi_amount != null ? String(a.emi_amount) : "");
      setOdLimit(a.overdraft_limit != null ? String(a.overdraft_limit) : "");
    }
  }, [accounts, editing, params.id]);

  const isCard = type === "credit_card";
  const isLoan = type === "loan";
  const isOD = type === "overdraft";

  const save = useMutation({
    mutationFn: () => {
      const body: any = {
        workspace_id: currentId, name, type, currency,
        opening_balance: parseFloat(opening) || 0,
        credit_limit: isCard ? parseFloat(limit) || 0 : null,
        statement_day: isCard ? parseInt(stmtDay) || 1 : null,
        due_day: isCard ? parseInt(dueDay) || 18 : null,
        lender_name: isLoan ? lender || null : null,
        interest_rate: isLoan ? parseFloat(rate) || null : null,
        tenure_months: isLoan ? parseInt(tenure) || null : null,
        emi_amount: isLoan ? parseFloat(emi) || null : null,
        overdraft_limit: isOD ? parseFloat(odLimit) || null : null,
      };
      return editing
        ? api(`/accounts/${params.id}`, { method: "PUT", body })
        : api("/accounts", { method: "POST", body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts", currentId] });
      qc.invalidateQueries({ queryKey: ["dashboard", currentId] });
      qc.invalidateQueries({ queryKey: ["credit-cards", currentId] });
      toast.show(editing ? "Account updated" : "Account added", "success");
      router.back();
    },
    onError: (e: any) => toast.show(e.message || "Failed", "error"),
  });

  return (
    <View style={s.root}>
      <Header title={editing ? "Edit Account" : "Add Account"} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, width: "100%", maxWidth: isWide ? 560 : undefined, alignSelf: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="Account name" testID="acc-name" value={name} onChangeText={setName} placeholder={isLoan ? "e.g. HDFC Home Loan" : isOD ? "e.g. Current Account OD" : "e.g. HDFC Savings"} autoFocus={!editing} />
        <Select label="Type" testID="acc-type" value={type} options={TYPES} onChange={setType} />
        <Select label="Currency" testID="acc-currency" value={currency} options={CURRENCIES.map((c) => ({ label: c, value: c }))} onChange={setCurrency} />

        {/* Credit card specific */}
        {isCard && (
          <>
            <Field label="Credit limit" testID="acc-limit" value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="0.00" />
            <Field label="Statement day (1-28)" testID="acc-stmt" value={stmtDay} onChangeText={setStmtDay} keyboardType="number-pad" placeholder="1" />
            <Field label="Due day (1-28)" testID="acc-due" value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="18" />
          </>
        )}

        {/* Loan specific */}
        {isLoan && (
          <>
            <Field
              label="Current outstanding balance"
              testID="acc-opening"
              value={opening}
              onChangeText={setOpening}
              keyboardType="decimal-pad"
              placeholder="e.g. 4500000"
            />
            <Text style={s.sectionLabel}>Loan details (optional)</Text>
            <View style={s.sectionBox}>
              <Field label="Lender / Bank name" testID="acc-lender" value={lender} onChangeText={setLender} placeholder="e.g. HDFC Bank" />
              <Field label="Interest rate (% p.a.)" testID="acc-rate" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="e.g. 8.5" />
              <Field label="Tenure (months)" testID="acc-tenure" value={tenure} onChangeText={setTenure} keyboardType="number-pad" placeholder="e.g. 240" />
              <Field label="EMI amount" testID="acc-emi" value={emi} onChangeText={setEmi} keyboardType="decimal-pad" placeholder="e.g. 45000" />
            </View>
            <Text style={s.sectionNote}>
              Record EMI payments as transfers from your bank account to this loan account — outstanding balance will reduce automatically.
            </Text>
          </>
        )}

        {/* Overdraft specific */}
        {isOD && (
          <>
            <Field label="Opening balance" testID="acc-opening" value={opening} onChangeText={setOpening} keyboardType="decimal-pad" placeholder="0.00" />
            <Field label="Overdraft limit" testID="acc-od-limit" value={odLimit} onChangeText={setOdLimit} keyboardType="decimal-pad" placeholder="e.g. 100000" />
            <Text style={s.sectionNote}>
              Balance can go negative up to the overdraft limit. Transactions work like a regular bank account.
            </Text>
          </>
        )}

        {/* Bank / Cash opening balance */}
        {!isCard && !isLoan && !isOD && (
          <Field label="Opening balance" testID="acc-opening" value={opening} onChangeText={setOpening} keyboardType="decimal-pad" placeholder="0.00" />
        )}

        <Button title={editing ? "Save changes" : "Add Account"} testID="save-account" loading={save.isPending} disabled={!name} onPress={() => save.mutate()} style={{ marginTop: 8 }} />
      </ScrollView>
    </View>
  );
}
