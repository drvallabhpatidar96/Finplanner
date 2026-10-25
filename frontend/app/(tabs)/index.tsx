import React, { useCallback } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useWorkspace } from "@/src/workspace";
import { usesNativeTabs } from "@/src/navigation";
import { useResponsive } from "@/src/responsive";
import { money } from "@/src/format";
import { Icon } from "@/src/components/icon";
import { Fab } from "@/src/components/fab";
import { AdSlot } from "@/src/components/ad-slot";
import { WorkspaceSwitcher } from "@/src/components/workspace-switcher";
import { EmptyState, Button } from "@/src/components/ui";
import { PortfolioSummaryCard } from '@/src/components/PortfolioSummaryCard';

const ACC_ICON: Record<string, string> = { bank: "Bank", cash: "Money", credit_card: "CreditCard" };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.surface, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  section: { paddingHorizontal: 16, marginTop: 20 },
  netLabel: { color: c.muted, fontFamily: fonts.textMedium, fontSize: 13, letterSpacing: 0.5 },
  netValue: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 52, lineHeight: 56, marginTop: 2 },
  flowRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  flowPill: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: c.border },
  flowLabel: { color: c.muted, fontFamily: fonts.textMedium, fontSize: 12 },
  flowVal: { fontFamily: fonts.displayBold, fontSize: 22, marginTop: 2 },
  sectionTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 20, marginBottom: 12 },
  accCard: { width: 150, backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 14, marginRight: 12, borderWidth: 1, borderColor: c.border },
  accType: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  accName: { color: c.onSurfaceSecondary, fontFamily: fonts.textMedium, fontSize: 13 },
  accBal: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22, marginTop: 2 },
  addCard: { width: 120, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: c.border, alignItems: "center", justifyContent: "center", marginRight: 12 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border },
  dueRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  catBarBg: { height: 8, borderRadius: 4, backgroundColor: c.surfaceTertiary, marginTop: 6, overflow: "hidden" },
  catName: { color: c.onSurfaceSecondary, fontFamily: fonts.textMedium, fontSize: 14 },
  catAmt: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 14 },
  memberRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider },
}));

export default function Dashboard() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { current, currentId } = useWorkspace();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard", currentId],
    queryFn: () => api(`/dashboard?workspace_id=${currentId}`),
    enabled: !!currentId,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ["budgets", currentId],
    queryFn: () => api(`/budgets?workspace_id=${currentId}`),
    enabled: !!currentId,
  });
  const budgetAlerts = (budgets as any[]).filter((b) => b.amount > 0 && b.spent >= b.amount * 0.8);

  const { isWide } = useResponsive();
  const gridWrap = isWide ? { flexDirection: "row" as const, flexWrap: "wrap" as const } : {};
  const gridItem = isWide ? { width: "50%" as const } : {};

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const base = data?.base_currency || current?.base_currency || "INR";
  const maxCat = Math.max(1, ...(data?.category_spend || []).map((c: any) => c.amount));

  const renderBody = () => {
    if (!currentId || isLoading) {
      return (
        <View style={{ paddingTop: 80, alignItems: "center" }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      );
    }
    if (!data?.accounts?.length) {
      return (
        <EmptyState icon="Wallet" title="No accounts yet" subtitle="Add a bank, cash or credit card account to start tracking your money.">
          <Button title="Add Account" icon="Plus" testID="empty-add-account" onPress={() => router.push("/add-account")} />
        </EmptyState>
      );
    }
    return (
      <>
        {/* Summary card */}
          <View style={s.flowPill}>
            <PortfolioSummaryCard 
              currentId={currentId}
              colors={colors}
              s={s}
            />
          </View>
        {/* Net worth */}
        <View style={s.section}>  
          <Text style={s.netLabel}>NET BALANCE</Text>
          <Text style={s.netValue} testID="net-balance">{money(data.net_worth, base, true)}</Text>

          <View style={s.flowRow}>
            <View style={s.flowPill}>
              <Text style={s.flowLabel}>Income · this month</Text>
              <Text style={[s.flowVal, { color: colors.success }]}>{money(data.month_income, base, true)}</Text>
            </View>
            <View style={s.flowPill}>
              <Text style={s.flowLabel}>Spent · this month</Text>
              <Text style={[s.flowVal, { color: colors.brandPrimary }]}>{money(data.month_expense, base, true)}</Text>
            </View>
          </View>
        </View>

        {/* Budget alerts */}
        {budgetAlerts.length > 0 && (
          <View style={s.section}>
            <Pressable
              testID="dashboard-budget-alert"
              onPress={() => router.push("/budgets")}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.brandTertiary, borderRadius: 14, padding: 14 }}
            >
              <Icon name="WarningCircle" size={22} color={colors.warning} weight="fill" />
              <Text style={{ flex: 1, color: colors.onBrandTertiary, fontFamily: fonts.textMedium, fontSize: 14 }}>
                {budgetAlerts.length} budget{budgetAlerts.length > 1 ? "s" : ""} near or over the limit
              </Text>
              <Icon name="CaretRight" size={18} color={colors.onBrandTertiary} />
            </Pressable>
          </View>
        )}

        {/* Accounts */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Accounts</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {data.accounts.map((a: any) => (
              <Pressable key={a.id} style={s.accCard} testID={`dash-account-${a.id}`} onPress={() => router.push("/accounts")}>
                <View style={s.accType}>
                  <Icon name={ACC_ICON[a.type] || "Wallet"} size={18} color={colors.brandPrimary} weight="bold" />
                </View>
                <Text style={s.accName} numberOfLines={1}>{a.name}</Text>
                <Text style={s.accBal} numberOfLines={1}>
                  {a.type === "credit_card" ? money(a.balance, a.currency, true) : money(a.balance, a.currency, true)}
                </Text>
                <Text style={[s.flowLabel, { marginTop: 2 }]}>{a.type === "credit_card" ? "outstanding" : a.currency}</Text>
              </Pressable>
            ))}
            <Pressable style={s.addCard} testID="dash-add-account" onPress={() => router.push("/add-account")}>
              <Icon name="Plus" size={26} color={colors.brandPrimary} weight="bold" />
              <Text style={[s.accName, { marginTop: 6 }]}>Add</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Credit card dues */}
        <View style={gridWrap}>
        {data.credit_card_dues > 0 && (
          <View style={[s.section, gridItem]}>
            <Pressable style={s.card} onPress={() => router.push("/(tabs)/cards")}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Icon name="CreditCard" size={22} color={colors.warning} weight="bold" />
                  <Text style={s.catName}>Credit card dues</Text>
                </View>
                <Text style={[s.accBal, { fontSize: 20, color: colors.warning }]}>{money(data.credit_card_dues, base, true)}</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* Shared contribution */}
        {data.shared && (
          <View style={[s.section, gridItem]}>
            <Text style={s.sectionTitle}>Household contributions</Text>
            <View style={s.card}>
              <Text style={s.flowLabel}>Total shared spending</Text>
              <Text style={[s.accBal, { fontSize: 26, marginBottom: 10 }]}>{money(data.shared.total_spending, base, true)}</Text>
              {data.shared.members.map((m: any) => (
                <View key={m.member_id} style={s.memberRow}>
                  <Text style={s.catName}>{m.name}</Text>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.catAmt}>paid {money(m.paid, base, true)}</Text>
                    <Text style={[s.flowLabel]}>share {money(m.allocated, base, true)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Category spend */}
        {data.category_spend?.length > 0 && (
          <View style={[s.section, gridItem]}>
            <Text style={s.sectionTitle}>Spending by category</Text>
            <View style={s.card}>
              {data.category_spend.map((c: any, i: number) => (
                <View key={c.category_id} style={{ marginBottom: i === data.category_spend.length - 1 ? 0 : 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={s.catName}>{c.name}</Text>
                    <Text style={s.catAmt}>{money(c.amount, base, true)}</Text>
                  </View>
                  <View style={s.catBarBg}>
                    <View style={{ height: 8, borderRadius: 4, width: `${Math.max(6, (c.amount / maxCat) * 100)}%`, backgroundColor: c.color }} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Upcoming */}
        {data.upcoming?.length > 0 && (
          <View style={[s.section, gridItem]}>
            <Text style={s.sectionTitle}>Upcoming</Text>
            <View style={s.card}>
              {data.upcoming.map((u: any, i: number) => (
                <View key={i} style={[s.dueRow, { borderBottomWidth: i === data.upcoming.length - 1 ? 0 : 1, borderBottomColor: colors.divider }]}>
                  <Icon name={u.type === "card_due" ? "CreditCard" : "Repeat"} size={20} color={colors.brandSecondary} weight="bold" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.catName}>{u.label}</Text>
                    <Text style={s.flowLabel}>{u.date}</Text>
                  </View>
                  <Text style={[s.catAmt, { color: u.kind === "income" ? colors.success : colors.onSurface }]}>
                    {money(u.amount, base, true)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!user?.premium && (
          <View style={[s.section, gridItem]}>
            <AdSlot testID="dashboard-ad-slot" />
          </View>
        )}
        </View>
      </>
    );
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        {isWide ? <View /> : <WorkspaceSwitcher />}
        <Pressable style={s.avatar} testID="dashboard-profile" onPress={() => router.push("/(tabs)/more")}>
          <Icon name="Gear" size={20} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomChrome + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
      >
        {renderBody()}
      </ScrollView>
      <Fab />
    </View>
  );
}
