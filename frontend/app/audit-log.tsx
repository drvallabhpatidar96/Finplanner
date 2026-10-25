import React from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { fmtFullDate } from "@/src/format";
import { Header } from "@/src/components/header";
import { Icon } from "@/src/components/icon";
import { EmptyState } from "@/src/components/ui";

const ACTION_ICON: Record<string, string> = {
  create: "Plus", delete: "Trash", payment: "ArrowUp", import: "UploadSimple", add_member: "Users",
};

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  detail: { color: c.onSurface, fontFamily: fonts.textMedium, fontSize: 14 },
  meta: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2 },
}));

export default function AuditLog() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentId } = useWorkspace();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit", currentId],
    queryFn: () => api(`/audit-log?workspace_id=${currentId}`),
    enabled: !!currentId,
  });

  return (
    <View style={s.root}>
      <Header title="Audit Log" />
      {isLoading ? (
        <View style={{ paddingTop: 80, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (logs as any[]).length === 0 ? (
        <EmptyState icon="ClockCounterClockwise" title="No activity yet" subtitle="Changes in this shared household will appear here." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {(logs as any[]).map((l) => (
            <View key={l.id} style={s.row}>
              <View style={s.iconBox}>
                <Icon name={ACTION_ICON[l.action] || "PencilSimple"} size={18} color={colors.brandPrimary} weight="bold" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.detail}>{l.detail}</Text>
                <Text style={s.meta}>{l.user_name} · {fmtFullDate(l.created_at)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
