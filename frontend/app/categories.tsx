import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useWorkspace } from "@/src/workspace";
import { Header } from "@/src/components/header";
import { Icon } from "@/src/components/icon";
import { Button, Field } from "@/src/components/ui";
import { SheetModal } from "@/src/components/sheet-modal";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  sectionLabel: { color: c.muted, fontFamily: fonts.textBold, fontSize: 12, letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16, marginHorizontal: 16, backgroundColor: c.surfaceSecondary, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: c.border },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, color: c.onSurface, fontFamily: fonts.textMedium, fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22, marginBottom: 12 },
  kindRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  kindBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
}));

const COLORS = ["#E55934", "#66BB6A", "#FFA726", "#D87D4A", "#8D6E63", "#E57373", "#D35400"];

export default function Categories() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentId } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [color, setColor] = useState(COLORS[0]);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", currentId],
    queryFn: () => api(`/categories?workspace_id=${currentId}`),
    enabled: !!currentId,
  });

  const create = useMutation({
    mutationFn: () => api("/categories", { method: "POST", body: { workspace_id: currentId, name, kind, color } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories", currentId] });
      setOpen(false);
      setName("");
      toast.show("Category added", "success");
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories", currentId] }),
  });

  const render = (kindFilter: "expense" | "income") =>
    (categories as any[]).filter((c) => c.kind === kindFilter).map((c) => (
      <Pressable key={c.id} style={s.row} testID={`category-${c.id}`} onLongPress={() => del.mutate(c.id)}>
        <View style={[s.dot, { backgroundColor: c.color }]} />
        <Text style={s.name}>{c.name}</Text>
        <Icon name={c.icon || "Tag"} size={18} color={colors.muted} />
      </Pressable>
    ));

  return (
    <View style={s.root}>
      <Header title="Categories" right={<Pressable testID="category-add" onPress={() => setOpen(true)} style={{ padding: 8 }}><Icon name="Plus" size={24} color={colors.brandPrimary} weight="bold" /></Pressable>} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Text style={s.sectionLabel}>EXPENSE</Text>
        {render("expense")}
        <Text style={s.sectionLabel}>INCOME</Text>
        {render("income")}
        <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: 16 }}>Long-press to remove</Text>
      </ScrollView>

      <SheetModal visible={open} onClose={() => setOpen(false)} title="New category">
        <View style={s.kindRow}>
          {(["expense", "income"] as const).map((k) => {
            const active = kind === k;
            return (
              <Pressable key={k} testID={`cat-kind-${k}`} style={[s.kindBtn, { borderColor: active ? colors.brandPrimary : colors.border, backgroundColor: active ? colors.brandPrimary : "transparent" }]} onPress={() => setKind(k)}>
                <Text style={{ color: active ? colors.onBrandPrimary : colors.onSurfaceTertiary, fontFamily: fonts.textBold, textTransform: "capitalize" }}>{k}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Name" testID="cat-name" value={name} onChangeText={setName} placeholder="e.g. Travel" />
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          {COLORS.map((col) => (
            <Pressable key={col} testID={`cat-color-${col}`} onPress={() => setColor(col)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: col, borderWidth: color === col ? 3 : 0, borderColor: colors.onSurface }} />
          ))}
        </View>
        <Button title="Add" testID="cat-save" loading={create.isPending} disabled={!name} onPress={() => create.mutate()} />
      </SheetModal>
    </View>
  );
}
