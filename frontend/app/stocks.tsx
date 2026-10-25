import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { money } from "@/src/format";
import { Header } from "@/src/components/header";
import { Icon } from "@/src/components/icon";
import { Button, EmptyState, Field } from "@/src/components/ui";
import { SheetModal } from "@/src/components/sheet-modal";
import { useToast } from "@/src/components/toast";
import { PortfolioSummaryCard } from '@/src/components/PortfolioSummaryCard';

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  summary: { padding: 16, marginHorizontal: 16, marginTop: 16, backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  sumLabel: { color: c.muted, fontFamily: fonts.textMedium, fontSize: 12, letterSpacing: 0.5 },
  sumVal: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 32, marginTop: 2 },
  row: { marginHorizontal: 16, marginTop: 10, backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  rowInner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  sym: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 15 },
  sub: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2 },
  val: { fontFamily: fonts.textBold, fontSize: 15 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontFamily: fonts.textBold, fontSize: 10 },
  pnlBar: { height: 3, borderRadius: 0 },
  fieldHint: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, marginBottom: 10 },
  fieldHintText: { fontFamily: fonts.text, fontSize: 12 },
  searchBox: { borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: "hidden", marginBottom: 12, backgroundColor: c.surfaceElevated || c.surfaceSecondary },
  searchItem: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  searchItemBorder: { borderTopWidth: 1, borderTopColor: c.border },
  exBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  exBadgeText: { fontFamily: fonts.textBold, fontSize: 9, letterSpacing: 0.3 },
}));

function timeAgo(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Stocks() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { current, currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const base = current?.base_currency || "INR";

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [avg, setAvg] = useState("");
  const [cur, setCur] = useState("");
  const [ownership, setOwnership] = useState<Record<string, string>>({});

  // Symbol lookup state
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "not_found">("idle");

  // Company name search
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const suppressNextSearch = useRef(false);

  const isShared = current?.type === "shared";
  const members = current?.members || [];

  const { data: stocks = [] } = useQuery({
    queryKey: ["stocks", currentId],
    queryFn: () => api(`/stocks?workspace_id=${currentId}`),
    enabled: !!currentId,
  });

  // Refresh live prices
  const refresh = useMutation({
    mutationFn: () => api(`/stocks/refresh-prices?workspace_id=${currentId}`, { method: "POST" }),
    onSuccess: (data: any) => {
      qc.setQueryData(["stocks", currentId], data.stocks);
    },
    onError: () => toast.show("Could not refresh prices", "error"),
  });

  // Auto-refresh every time the page comes into focus
  useFocusEffect(
    useCallback(() => {
      if (currentId) {
        refresh.mutate();
      }
    }, [currentId])
  );

  // Auto-lookup price when symbol changes (debounced, only in add mode)
  useEffect(() => {
    if (!symbol || editId) return;
    setLookupState("loading");
    const timer = setTimeout(async () => {
      try {
        const q = await api(`/stocks/quote/${encodeURIComponent(symbol)}`);
        if (q.price) {
          setCur(String(q.price));
          if (!name && q.name) setName(q.name);
          setLookupState("found");
        } else {
          setLookupState("not_found");
        }
      } catch {
        setLookupState("not_found");
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [symbol]);

  // Company name / symbol search (debounced 400 ms, add mode only)
  useEffect(() => {
    if (editId) return;
    if (suppressNextSearch.current) {
      suppressNextSearch.current = false;
      return;
    }
    if (!symbol || symbol.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api(`/stocks/search?q=${encodeURIComponent(symbol)}`);
        setSearchResults(results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [symbol, editId]);

  const allStocks = stocks as any[];
  const totalInvested = allStocks.reduce((a, st) => a + (st.invested || 0), 0);
  const totals = allStocks.reduce((acc, st) => {
    acc.value += st.current_value || 0;
    acc.pnl += st.pnl || 0;
    return acc;
  }, { value: 0, pnl: 0 });
  const totalPnlPct = totalInvested > 0 ? ((totals.pnl / totalInvested) * 100).toFixed(1) : "0.0";

  // Last refresh time across all holdings
  const refreshTimes = allStocks.map((st) => st.last_price_refreshed_at).filter(Boolean);
  const latestRefresh = refreshTimes.length > 0 ? refreshTimes.sort().reverse()[0] : null;

  const body = () => ({
    workspace_id: currentId, symbol, name: name || symbol,
    quantity: parseFloat(qty) || 0, avg_price: parseFloat(avg) || 0, current_price: parseFloat(cur) || 0, currency: base,
    ownership: isShared ? members.map((m) => ({ member_id: m.member_id, percent: parseFloat(ownership[m.member_id] || "0") || 0 })).filter((o) => o.percent > 0) : [],
  });

  const save = useMutation({
    mutationFn: () => editId ? api(`/stocks/${editId}`, { method: "PUT", body: body() }) : api("/stocks", { method: "POST", body: body() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocks", currentId] });
      setOpen(false);
      toast.show(editId ? "Updated" : "Holding added", "success");
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/stocks/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stocks", currentId] }),
  });

  const openNew = () => {
    setEditId(null); setSymbol(""); setName(""); setQty(""); setAvg(""); setCur("");
    setOwnership({}); setLookupState("idle"); setSearchResults([]); setSearchLoading(false); setOpen(true);
  };
  const openEdit = (st: any) => {
    setEditId(st.id); setSymbol(st.symbol); setName(st.name);
    setQty(String(st.quantity)); setAvg(String(st.avg_price)); setCur(String(st.current_price));
    const o: Record<string, string> = {};
    (st.ownership || []).forEach((x: any) => (o[x.member_id] = String(x.percent)));
    setOwnership(o);
    setLookupState("idle"); setSearchResults([]);
    setOpen(true);
  };

  const selectSearchResult = (r: any) => {
    suppressNextSearch.current = true;      // don't re-trigger search for the resolved ticker
    setSymbol(r.symbol);
    if (!name) setName(r.name || r.symbol);
    setSearchResults([]);
    setSearchLoading(false);
    setLookupState("idle");                  // price lookup effect will fire next
  };
  const evenSplit = () => {
    const n = members.length || 1;
    const each = (100 / n).toFixed(2);
    const next: Record<string, string> = {};
    members.forEach((m) => (next[m.member_id] = each));
    setOwnership(next);
  };

  const RefreshBtn = () => (
    <Pressable
      testID="stock-refresh"
      onPress={() => refresh.mutate()}
      disabled={refresh.isPending}
      style={{ padding: 8, marginRight: 4 }}
    >
      {refresh.isPending
        ? <ActivityIndicator size={18} color={colors.brandPrimary} />
        : <Icon name="ArrowsClockwise" size={22} color={colors.brandPrimary} weight="bold" />
      }
    </Pressable>
  );

  return (
    <View style={s.root}>
      <Header
        title="Stock Holdings"
        right={
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <RefreshBtn />
            <Pressable testID="stock-add" onPress={openNew} style={{ padding: 8 }}>
              <Icon name="Plus" size={24} color={colors.brandPrimary} weight="bold" />
            </Pressable>
          </View>
        }
      />

      {allStocks.length === 0 ? (
        <EmptyState icon="ChartLineUp" title="No holdings" subtitle="Add stocks — prices auto-refresh from live markets.">
          <Button title="Add Holding" icon="Plus" onPress={openNew} />
        </EmptyState>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {/* Summary card */}
            <PortfolioSummaryCard 
              currentId={currentId}
              colors={colors}
              s={s}
            />
            

          {/* Holdings list */}
          {allStocks.map((st) => {
            const pnlPct = st.pnl_pct ?? (st.invested > 0 ? ((st.pnl / st.invested) * 100).toFixed(1) : "0.0");
            const isLive = !!st.last_price_refreshed_at;
            const pnlColor = st.pnl >= 0 ? colors.success : colors.error;
            const barPct = Math.min(Math.abs(parseFloat(String(pnlPct))), 30) / 30;
            return (
              <Pressable key={st.id} style={s.row} testID={`stock-${st.id}`} onPress={() => openEdit(st)} onLongPress={() => del.mutate(st.id)}>
                <View style={s.rowInner}>
                  {/* Left */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Text style={s.sym}>{st.symbol}</Text>
                      {isLive && (
                        <View style={[s.badge, { backgroundColor: colors.success + "22" }]}>
                          <View style={[s.liveDot, { backgroundColor: colors.success }]} />
                          <Text style={[s.badgeText, { color: colors.success }]}>LIVE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.sub} numberOfLines={1}>{st.name}</Text>
                    <Text style={s.sub}>{st.quantity} units · avg {money(st.avg_price, st.currency, true)}</Text>
                  </View>

                  {/* Right */}
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.val}>{money(st.current_value, st.currency, true)}</Text>
                    <Text style={{ fontFamily: fonts.textMedium, fontSize: 12, color: pnlColor, marginTop: 2 }}>
                      {st.pnl >= 0 ? "+" : ""}{money(st.pnl, st.currency, true)} ({st.pnl >= 0 ? "+" : ""}{parseFloat(String(pnlPct)).toFixed(1)}%)
                    </Text>
                    <Text style={{ fontFamily: fonts.text, fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      @ {money(st.current_price, st.currency, false)}
                    </Text>
                    {isShared && st.my_share !== undefined && (
                      <Text style={[s.sub, { color: colors.brandSecondary }]}>you {money(st.my_share, st.currency, true)}</Text>
                    )}
                  </View>
                </View>
                {/* P&L bar */}
                <View style={{ height: 3, backgroundColor: colors.border }}>
                  <View style={{ height: 3, width: `${barPct * 100}%`, backgroundColor: pnlColor }} />
                </View>
              </Pressable>
            );
          })}

          <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: 16 }}>
            Tap to edit · long-press to remove
          </Text>
        </ScrollView>
      )}

      {/* Add / Edit sheet */}
      <SheetModal visible={open} onClose={() => setOpen(false)} title={editId ? "Edit holding" : "New holding"}>

        {/* Symbol / company search field */}
        <View>
          <Field
            label={editId ? "Symbol" : "Search company or symbol"}
            testID="stock-symbol"
            value={symbol}
            onChangeText={(t) => { setSymbol(t.toUpperCase()); setLookupState("idle"); }}
            placeholder={editId ? "" : "e.g. TCS, Tata, Apple, RELIANCE"}
            autoCapitalize="characters"
          />

          {/* Live search results dropdown (add mode only) */}
          {!editId && (searchLoading || searchResults.length > 0) && (
            <View style={s.searchBox}>
              {searchLoading && (
                <View style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size={14} color={colors.brandPrimary} />
                  <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 13 }}>Searching…</Text>
                </View>
              )}
              {!searchLoading && searchResults.map((r, i) => {
                const isNSE = r.exchange === "NSE";
                const isBSE = r.exchange === "BSE";
                const badgeColor = isNSE || isBSE ? colors.brandPrimary : colors.brandSecondary || colors.success;
                return (
                  <Pressable
                    key={r.symbol}
                    style={({ pressed }) => [
                      s.searchItem,
                      i > 0 && s.searchItemBorder,
                      { backgroundColor: pressed ? colors.border : "transparent" },
                    ]}
                    onPress={() => selectSearchResult(r)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.onSurface, fontFamily: fonts.textMedium, fontSize: 14 }} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2 }}>
                        {r.symbol}
                      </Text>
                    </View>
                    <View style={[s.exBadge, { backgroundColor: badgeColor + "22" }]}>
                      <Text style={[s.exBadgeText, { color: badgeColor }]}>{r.exchange}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Price lookup status hint (only when no dropdown showing) */}
          {!editId && symbol.length > 0 && searchResults.length === 0 && !searchLoading && (
            <View style={s.fieldHint}>
              {lookupState === "loading" && <ActivityIndicator size={12} color={colors.brandPrimary} />}
              {lookupState === "found" && <Icon name="CheckCircle" size={13} color={colors.success} weight="fill" />}
              {lookupState === "not_found" && <Icon name="Warning" size={13} color={colors.warning} weight="fill" />}
              <Text style={[s.fieldHintText, {
                color: lookupState === "found" ? colors.success
                  : lookupState === "not_found" ? colors.warning
                  : colors.muted,
              }]}>
                {lookupState === "loading" ? "Fetching live price…"
                  : lookupState === "found" ? "Live price auto-filled"
                  : lookupState === "not_found" ? "Symbol not found — enter price manually"
                  : ""}
              </Text>
            </View>
          )}
        </View>

        <Field label="Name (optional)" testID="stock-name" value={name} onChangeText={setName} placeholder="Tata Consultancy" />
        <Field label="Quantity" testID="stock-qty" value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="10" />
        <Field label="Avg buy price" testID="stock-avg" value={avg} onChangeText={setAvg} keyboardType="decimal-pad" placeholder="3200" />
        <Field
          label="Current price"
          testID="stock-cur"
          value={cur}
          onChangeText={setCur}
          keyboardType="decimal-pad"
          placeholder="Auto-filled from market"
        />

        {isShared && (
          <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ color: colors.onSurfaceTertiary, fontFamily: fonts.textMedium, fontSize: 13 }}>Ownership %</Text>
              <Pressable testID="ownership-even" onPress={evenSplit}>
                <Text style={{ color: colors.brandPrimary, fontFamily: fonts.textBold, fontSize: 13 }}>Even split</Text>
              </Pressable>
            </View>
            {members.map((m) => (
              <View key={m.member_id} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Text style={{ flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.textMedium, fontSize: 14 }}>{m.name}</Text>
                <View style={{ width: 90 }}>
                  <Field value={ownership[m.member_id] || ""} onChangeText={(t) => setOwnership((p) => ({ ...p, [m.member_id]: t }))} placeholder="0" keyboardType="decimal-pad" style={{ textAlign: "right", paddingVertical: 10 }} />
                </View>
              </View>
            ))}
            <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 11 }}>Must add up to 100% if set.</Text>
          </View>
        )}
        <Button title={editId ? "Save" : "Add"} testID="stock-save" loading={save.isPending} disabled={!symbol || !qty} onPress={() => save.mutate()} />
      </SheetModal>
    </View>
  );
}
