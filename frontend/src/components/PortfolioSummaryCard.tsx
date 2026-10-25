// src/components/PortfolioSummaryCard.tsx
import React from "react";
import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { money } from "@/src/format";
import { fonts } from "@/src/theme";

interface PortfolioSummaryCardProps {
  currentId: string | null;
  colors: any;
  s: any;
}

function timeAgo(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export const PortfolioSummaryCard: React.FC<PortfolioSummaryCardProps> = ({
  currentId,
  colors,
  s,
}) => {
  // Fetch stocks directly inside the component
  const { data: stocks = [], base_currency } = useQuery({
    queryKey: ["stocks", currentId],
    queryFn: () => api(`/stocks?workspace_id=${currentId}`),
    enabled: !!currentId,
  }) as { data: any[]; base_currency?: string };

  const base = base_currency || "INR";
  const allStocks = stocks || [];
  const totalInvested = allStocks.reduce((a, st) => a + (st.invested || 0), 0);
  const totals = allStocks.reduce(
    (acc, st) => {
      acc.value += st.current_value || 0;
      acc.pnl += st.pnl || 0;
      return acc;
    },
    { value: 0, pnl: 0 }
  );
  const totalPnlPct = totalInvested > 0 ? ((totals.pnl / totalInvested) * 100).toFixed(1) : "0.0";

  const refreshTimes = allStocks.map((st) => st.last_price_refreshed_at).filter(Boolean);
  const latestRefresh = refreshTimes.length > 0 ? refreshTimes.sort().reverse()[0] : null;

  return (
    <View style={s.summary}>
      <Text style={s.sumLabel}>PORTFOLIO VALUE</Text>
      <Text style={s.sumVal}>{money(totals.value, base, true)}</Text>
      
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8 }}>
        <Text style={{ color: totals.pnl >= 0 ? colors.success : colors.error, fontFamily: fonts.textBold, fontSize: 14 }}>
          {totals.pnl >= 0 ? "▲" : "▼"} {money(Math.abs(totals.pnl), base, true)} ({totals.pnl >= 0 ? "+" : "-"}{Math.abs(parseFloat(totalPnlPct))}%)
        </Text>
      </View>

      {latestRefresh ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 5 }}>
          <View style={[s.liveDot, { backgroundColor: colors.success }]} />
          <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 11 }}>
            Live · updated {timeAgo(latestRefresh)}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 5 }}>
          <View style={[s.liveDot, { backgroundColor: colors.muted }]} />
          <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 11 }}>Manual prices · tap ↻ to refresh</Text>
        </View>
      )}
    </View>
  );
};