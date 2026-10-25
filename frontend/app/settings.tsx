import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useWorkspace } from "@/src/workspace";
import { Header } from "@/src/components/header";
import { Icon } from "@/src/components/icon";
import { Button } from "@/src/components/ui";
import { Select } from "@/src/components/select";
import { useToast } from "@/src/components/toast";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CHF"];
const COUNTRIES = [
  { label: "India", value: "IN" }, { label: "United States", value: "US" }, { label: "United Kingdom", value: "GB" },
  { label: "Eurozone", value: "EU" }, { label: "UAE", value: "AE" }, { label: "Singapore", value: "SG" },
  { label: "Australia", value: "AU" }, { label: "Canada", value: "CA" },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  section: { paddingHorizontal: 16, marginTop: 16 },
  label: { color: c.muted, fontFamily: fonts.textBold, fontSize: 12, letterSpacing: 0.5, marginBottom: 10 },
  item: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15, paddingHorizontal: 16, backgroundColor: c.surfaceSecondary, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: c.border },
  itemText: { flex: 1, color: c.onSurface, fontFamily: fonts.textMedium, fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: c.surfaceSecondary, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: c.border },
  dialogTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22, marginBottom: 8 },
  dialogText: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, lineHeight: 21, marginBottom: 18 },
  code: { color: c.onSurfaceTertiary, fontFamily: fonts.text, fontSize: 12 },
}));

export default function Settings() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, refreshUser, signOut } = useAuth();
  const { current } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const [country, setCountry] = useState(user?.country || "IN");
  const [currency, setCurrency] = useState(user?.base_currency || "INR");
  const [exportData, setExportData] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRegion = useMutation({
    mutationFn: () => api("/users/country", { method: "PUT", body: { country, base_currency: currency } }),
    onSuccess: async () => { await refreshUser(); qc.invalidateQueries(); toast.show("Region updated", "success"); },
  });

  const doExport = async () => {
    try {
      const data = await api(`/export?workspace_id=${current?.id}`);
      setExportData(data);
    } catch (e: any) {
      toast.show(e.message || "Export failed", "error");
    }
  };

  const del = useMutation({
    mutationFn: () => api("/users/me", { method: "DELETE" }),
    onSuccess: async () => { toast.show("Account deleted", "success"); await signOut(); },
  });

  return (
    <View style={s.root}>
      <Header title="Settings" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={s.section}>
          <Text style={s.label}>REGION & CURRENCY</Text>
          <Select label="Country" testID="set-country" value={country} options={COUNTRIES} onChange={setCountry} />
          <Select label="Base currency" testID="set-currency" value={currency} options={CURRENCIES.map((c) => ({ label: c, value: c }))} onChange={setCurrency} />
          <Button title="Save region" testID="save-region" loading={saveRegion.isPending} onPress={() => saveRegion.mutate()} />
        </View>

        <View style={s.section}>
          <Text style={s.label}>DATA</Text>
          <Pressable style={s.item} testID="export-data" onPress={doExport}>
            <Icon name="FileArrowDown" size={22} color={colors.brandPrimary} weight="bold" />
            <Text style={s.itemText}>Export current workspace</Text>
            <Icon name="CaretRight" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <View style={s.section}>
          <Text style={s.label}>DANGER ZONE</Text>
          <Pressable style={[s.item, { borderColor: colors.error }]} testID="delete-account" onPress={() => setConfirmDelete(true)}>
            <Icon name="Trash" size={22} color={colors.error} weight="bold" />
            <Text style={[s.itemText, { color: colors.error }]}>Delete my account</Text>
          </Pressable>
          <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 6 }}>
            Permanently removes your account and workspaces. This cannot be undone.
          </Text>
        </View>
      </ScrollView>

      {/* Export result */}
      <Modal visible={!!exportData} transparent animationType="fade" onRequestClose={() => setExportData(null)}>
        <View style={s.backdrop}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Export ready</Text>
            <Text style={s.dialogText}>Your workspace data snapshot:</Text>
            {exportData && (
              <View style={{ marginBottom: 16 }}>
                {[
                  ["Accounts", exportData.accounts?.length],
                  ["Transactions", exportData.transactions?.length],
                  ["Categories", exportData.categories?.length],
                  ["Budgets", exportData.budgets?.length],
                  ["Fixed deposits", exportData.fixed_deposits?.length],
                  ["Stocks", exportData.stocks?.length],
                ].map(([k, v]) => (
                  <View key={k as string} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                    <Text style={s.code}>{k}</Text>
                    <Text style={[s.code, { color: colors.onSurface }]}>{v ?? 0}</Text>
                  </View>
                ))}
              </View>
            )}
            <Button title="Done" testID="export-done" onPress={() => setExportData(null)} />
          </View>
        </View>
      </Modal>

      {/* Delete confirm */}
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={s.backdrop}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Delete account?</Text>
            <Text style={s.dialogText}>This permanently deletes your FinPlanner account and all your workspaces. This action cannot be undone.</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title="Cancel" variant="secondary" style={{ flex: 1 }} testID="cancel-delete" onPress={() => setConfirmDelete(false)} />
              <Button title="Delete" variant="danger" style={{ flex: 1 }} testID="confirm-delete" loading={del.isPending} onPress={() => del.mutate()} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
