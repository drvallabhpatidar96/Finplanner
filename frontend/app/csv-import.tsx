import React, { useState } from "react";
import { View, Text, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { Header } from "@/src/components/header";
import { Button } from "@/src/components/ui";
import { Select } from "@/src/components/select";
import { useToast } from "@/src/components/toast";

const SAMPLE = `date,amount,type,note
2026-06-01,1200,expense,Groceries
2026-06-02,45000,income,Salary
2026-06-03,350,expense,Coffee`;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  label: { color: c.onSurfaceTertiary, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: 6 },
  help: { color: c.muted, fontFamily: fonts.text, fontSize: 13, lineHeight: 20, marginBottom: 16 },
  input: { backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 14, color: c.onSurface, fontFamily: fonts.text, fontSize: 14, minHeight: 200, textAlignVertical: "top", borderWidth: 1, borderColor: c.border },
}));

function parseCsv(text: string): any[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: any = {};
    headers.forEach((h, i) => (row[h] = (cells[i] || "").trim()));
    return row;
  });
}

export default function CsvImport() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const [accountId, setAccountId] = useState<string | null>(null);
  const [text, setText] = useState(SAMPLE);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", currentId],
    queryFn: () => api(`/accounts?workspace_id=${currentId}`),
    enabled: !!currentId,
  });

  const imp = useMutation({
    mutationFn: () => api("/transactions/import", { method: "POST", body: { workspace_id: currentId, account_id: accountId, rows: parseCsv(text) } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["transactions", currentId] });
      qc.invalidateQueries({ queryKey: ["dashboard", currentId] });
      qc.invalidateQueries({ queryKey: ["accounts", currentId] });
      toast.show(`Imported ${r.imported} transactions`, "success");
      router.back();
    },
    onError: (e: any) => toast.show(e.message || "Import failed", "error"),
  });

  return (
    <View style={s.root}>
      <Header title="Import CSV" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Text style={s.help}>
          Paste CSV rows below with columns: <Text style={{ color: colors.onSurface }}>date, amount, type, note</Text>. Type should be "expense" or "income". Transactions import into the selected account.
        </Text>
        <Select label="Import into account" testID="csv-account" placeholder="Choose account" value={accountId} options={(accounts as any[]).map((a) => ({ label: a.name, value: a.id, sublabel: a.type.replace("_", " ") }))} onChange={setAccountId} />
        <Text style={s.label}>CSV data</Text>
        <TextInput testID="csv-input" multiline value={text} onChangeText={setText} style={s.input} placeholderTextColor={colors.muted} />
        <Button title="Import transactions" icon="UploadSimple" testID="csv-import-btn" style={{ marginTop: 16 }} loading={imp.isPending} disabled={!accountId} onPress={() => imp.mutate()} />
      </ScrollView>
    </View>
  );
}
