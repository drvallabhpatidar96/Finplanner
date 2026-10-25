import React, { useMemo, useState } from "react";
import { View, Text, SectionList, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollView } from "react-native-gesture-handler";
import { router } from "expo-router";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { usesNativeTabs } from "@/src/navigation";
import { money, fmtFullDate } from "@/src/format";
import { Icon } from "@/src/components/icon";
import { Fab } from "@/src/components/fab";
import { Chip, EmptyState } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.surface, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 28, marginBottom: 12 },
  chipRow: { gap: 8, paddingRight: 16 },
  sectionHead: { color: c.muted, fontFamily: fonts.textBold, fontSize: 12, letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, backgroundColor: c.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  note: { color: c.onSurface, fontFamily: fonts.textMedium, fontSize: 15 },
  sub: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2 },
  amt: { fontFamily: fonts.textBold, fontSize: 16 },
}));

const FILTERS = [
  { key: "all", label: "All" },
  { key: "expense", label: "Expense" },
  { key: "income", label: "Income" },
  { key: "transfer", label: "Transfer" },
];

export default function Transactions() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { current, currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ["transactions", currentId],
    queryFn: () => api(`/transactions?workspace_id=${currentId}`),
    enabled: !!currentId,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", currentId],
    queryFn: () => api(`/categories?workspace_id=${currentId}`),
    enabled: !!currentId,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", currentId],
    queryFn: () => api(`/accounts?workspace_id=${currentId}`),
    enabled: !!currentId,
  });

  const catMap = useMemo(() => Object.fromEntries((categories as any[]).map((c) => [c.id, c])), [categories]);
  const accMap = useMemo(() => Object.fromEntries((accounts as any[]).map((a) => [a.id, a])), [accounts]);

  const del = useMutation({
    mutationFn: (id: string) => api(`/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", currentId] });
      qc.invalidateQueries({ queryKey: ["dashboard", currentId] });
      qc.invalidateQueries({ queryKey: ["accounts", currentId] });
      toast.show("Deleted", "success");
    },
  });

  const sections = useMemo(() => {
    const filtered = (txns as any[]).filter((t) => filter === "all" || t.type === filter);
    const groups: Record<string, any[]> = {};
    filtered.forEach((t) => {
      const d = t.date;
      (groups[d] = groups[d] || []).push(t);
    });
    return Object.keys(groups)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((d) => ({ title: fmtFullDate(d), data: groups[d] }));
  }, [txns, filter]);

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const renderRow = ({ item }: { item: any }) => {
    const cat = catMap[item.category_id];
    const acc = accMap[item.account_id];
    const color = item.type === "income" ? colors.success : item.type === "transfer" ? colors.info : item.is_refund ? colors.success : colors.brandPrimary;
    const icon = item.type === "transfer" ? "ArrowsLeftRight" : item.type === "income" ? "ArrowDown" : cat?.icon || "Tag";
    const sign = item.type === "income" || item.is_refund ? "+" : item.type === "expense" ? "-" : "";
    return (
      <Pressable style={s.row} testID={`txn-${item.id}`} onPress={() => router.push(`/add-transaction?id=${item.id}`)} onLongPress={() => del.mutate(item.id)}>
        <View style={[s.iconBox, { backgroundColor: colors.surfaceTertiary }]}>
          <Icon name={icon} size={20} color={color} weight="bold" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.note}>{item.note || cat?.name || (item.type === "transfer" ? "Transfer" : "Transaction")}</Text>
          <Text style={s.sub}>
            {cat?.name ? cat.name + " · " : ""}{acc?.name || ""}{item.created_by_name ? ` · ${item.created_by_name}` : ""}
          </Text>
        </View>
        <Text style={[s.amt, { color }]}>{sign}{money(item.amount, item.currency, true)}</Text>
      </Pressable>
    );
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Text style={s.title}>Activity</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} testID={`filter-${f.key}`} />
          ))}
        </ScrollView>
      </View>

      {!currentId || isLoading ? (
        <View style={{ paddingTop: 80, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : sections.length === 0 ? (
        <EmptyState icon="Receipt" title="No transactions" subtitle="Tap the + button to record your first entry." />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          renderSectionHeader={({ section }) => <Text style={s.sectionHead}>{section.title.toUpperCase()}</Text>}
          contentContainerStyle={{ paddingBottom: bottomChrome + 110 }}
          stickySectionHeadersEnabled={false}
        />
      )}
      <Fab />
    </View>
  );
}
