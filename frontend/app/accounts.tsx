import React from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { money } from "@/src/format";
import { Header } from "@/src/components/header";
import { Icon } from "@/src/components/icon";
import { Button, EmptyState } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";

const ACC_ICON: Record<string, string> = {
  bank: "Bank",
  cash: "Money",
  credit_card: "CreditCard",
  loan: "Coins",
  overdraft: "ArrowsLeftRight",
};

const ACC_LABEL: Record<string, string> = {
  bank: "Bank account",
  cash: "Cash",
  credit_card: "Credit card",
  loan: "Loan",
  overdraft: "Overdraft",
};

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, marginHorizontal: 16, marginTop: 12, backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 16 },
  type: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2 },
  bal: { fontFamily: fonts.displayBold, fontSize: 20 },
  balLabel: { fontFamily: fonts.text, fontSize: 11, marginTop: 2 },
}));

export default function Accounts() {
  const s = useStyles();
  const { colors } = useTheme();
  const { currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts", currentId],
    queryFn: () => api(`/accounts?workspace_id=${currentId}`),
    enabled: !!currentId,
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts", currentId] });
      qc.invalidateQueries({ queryKey: ["dashboard", currentId] });
      toast.show("Account removed", "success");
    },
  });

  const getBalColor = (a: any) => {
    if (a.type === "credit_card") return colors.warning;
    if (a.type === "loan") return colors.error;
    if (a.type === "overdraft" && a.balance < 0) return colors.warning;
    return colors.onSurface;
  };

  const getIconBg = (a: any) => {
    if (a.type === "credit_card") return colors.warning + "22";
    if (a.type === "loan") return colors.error + "22";
    if (a.type === "overdraft") return colors.brandPrimary + "22";
    return colors.brandPrimary + "22";
  };

  const getIconColor = (a: any) => {
    if (a.type === "credit_card") return colors.warning;
    if (a.type === "loan") return colors.error;
    return colors.brandPrimary;
  };

  const getBalLabel = (a: any) => {
    if (a.type === "loan") return "outstanding";
    if (a.type === "credit_card") return "outstanding";
    if (a.type === "overdraft" && a.balance < 0) return "overdrawn";
    return null;
  };

  const getSubtitle = (a: any) => {
    let parts = [ACC_LABEL[a.type] || a.type, a.currency];
    if (a.type === "loan" && a.lender_name) parts.splice(1, 0, a.lender_name);
    if (a.type === "overdraft" && a.overdraft_limit) parts.push(`limit ${money(a.overdraft_limit, a.currency, true)}`);
    if (a.type === "credit_card" && a.credit_limit) parts.push(`limit ${money(a.credit_limit, a.currency, true)}`);
    if (a.type === "loan" && a.interest_rate) parts.push(`${a.interest_rate}% p.a.`);
    if (a.type === "loan" && a.emi_amount) parts.push(`EMI ${money(a.emi_amount, a.currency, true)}`);
    return parts.join(" · ");
  };

  return (
    <View style={s.root}>
      <Header
        title="Accounts"
        right={
          <Pressable testID="accounts-add" onPress={() => router.push("/add-account")} style={{ padding: 8 }}>
            <Icon name="Plus" size={24} color={colors.brandPrimary} weight="bold" />
          </Pressable>
        }
      />
      {!currentId || isLoading ? (
        <View style={{ paddingTop: 80, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (accounts as any[]).length === 0 ? (
        <EmptyState icon="Wallet" title="No accounts" subtitle="Add bank accounts, cash, credit cards, loans and overdrafts.">
          <Button title="Add Account" icon="Plus" onPress={() => router.push("/add-account")} />
        </EmptyState>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {(accounts as any[]).map((a) => (
            <Pressable key={a.id} style={s.row} testID={`account-${a.id}`} onPress={() => router.push(`/add-account?id=${a.id}`)} onLongPress={() => del.mutate(a.id)}>
              <View style={[s.iconBox, { backgroundColor: getIconBg(a) }]}>
                <Icon name={ACC_ICON[a.type] || "Wallet"} size={22} color={getIconColor(a)} weight="bold" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{a.name}</Text>
                <Text style={s.type} numberOfLines={1}>{getSubtitle(a)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.bal, { color: getBalColor(a) }]}>
                  {money(a.balance, a.currency, true)}
                </Text>
                {getBalLabel(a) && (
                  <Text style={[s.balLabel, { color: getBalColor(a) }]}>{getBalLabel(a)}</Text>
                )}
              </View>
            </Pressable>
          ))}
          <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: 16 }}>
            Long-press an account to remove it
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
