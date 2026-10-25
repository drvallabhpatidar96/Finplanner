import React, { useState } from "react";
import { Pressable, Text, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { Icon } from "@/src/components/icon";
import { Button, Field } from "@/src/components/ui";
import { SheetModal } from "@/src/components/sheet-modal";
import { useToast } from "@/src/components/toast";
import { useWorkspace } from "@/src/workspace";

const useStyles = makeStyles((c) => ({
  trigger: {
    flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start",
    backgroundColor: c.surfaceSecondary, borderRadius: 999, paddingVertical: 8,
    paddingLeft: 12, paddingRight: 14, borderWidth: 1, borderColor: c.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 15 },
  tag: { fontSize: 10, fontFamily: fonts.textMedium, letterSpacing: 0.6 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: 12 },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22, marginBottom: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 12, marginBottom: 6,
  },
  rowName: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 16 },
  rowSub: { color: c.muted, fontFamily: fonts.text, fontSize: 12 },
  add: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1, borderColor: c.border, borderStyle: "dashed", marginTop: 6,
  },
}));

export function WorkspaceSwitcher() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { workspaces, current, setCurrentId, refetch } = useWorkspace();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const joinByCode = async () => {
    if (!code.trim()) return;
    setJoining(true);
    try {
      const ws = await api(`/workspaces/join`, { method: "POST", body: { code: code.trim() } });
      await refetch();
      setCurrentId(ws.id);
      setJoinOpen(false);
      setOpen(false);
      setCode("");
      toast.show(`Joined ${ws.name}!`, "success");
    } catch (e: any) {
      toast.show(e.message || "Invalid code", "error");
    } finally {
      setJoining(false);
    }
  };

  const isShared = current?.type === "shared";
  const accent = isShared ? colors.brandSecondary : colors.success;

  return (
    <>
      <Pressable
        testID="workspace-switcher"
        style={s.trigger}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setOpen(true);
        }}
      >
        <View style={[s.dot, { backgroundColor: accent }]} />
        <View>
          <Text style={s.name}>{current?.name || "Workspace"}</Text>
          <Text style={[s.tag, { color: accent }]}>{isShared ? "SHARED HOUSEHOLD" : "PERSONAL"}</Text>
        </View>
        <Icon name="CaretDown" size={16} color={colors.muted} />
      </Pressable>

      <SheetModal visible={open} onClose={() => setOpen(false)} title="Switch Workspace" testID="ws-switcher-modal">
        {workspaces.map((w) => {
          const selected = w.id === current?.id;
          const a = w.type === "shared" ? colors.brandSecondary : colors.success;
          return (
            <Pressable
              key={w.id}
              testID={`ws-option-${w.id}`}
              style={[s.row, { backgroundColor: selected ? colors.surfaceTertiary : "transparent" }]}
              onPress={() => {
                setCurrentId(w.id);
                setOpen(false);
              }}
            >
              <View style={[s.dot, { backgroundColor: a, width: 12, height: 12, borderRadius: 6 }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{w.name}</Text>
                <Text style={s.rowSub}>
                  {w.type === "shared" ? `${w.members.length} members` : "Personal"} · {w.base_currency}
                </Text>
              </View>
              {selected ? <Icon name="Check" size={20} color={colors.brandPrimary} weight="bold" /> : null}
            </Pressable>
          );
        })}
        <Pressable
          testID="join-with-code"
          style={s.add}
          onPress={() => setJoinOpen(true)}
        >
          <Icon name="Key" size={20} color={colors.brandPrimary} />
          <Text style={{ color: colors.onSurface, fontFamily: fonts.textMedium, fontSize: 15 }}>
            Join with invite code
          </Text>
        </Pressable>
        <Pressable
          testID="manage-workspaces-btn"
          style={s.add}
          onPress={() => {
            setOpen(false);
            router.push("/workspaces");
          }}
        >
          <Icon name="Users" size={20} color={colors.brandPrimary} />
          <Text style={{ color: colors.onSurface, fontFamily: fonts.textMedium, fontSize: 15 }}>
            Manage households
          </Text>
        </Pressable>
      </SheetModal>

      <SheetModal visible={joinOpen} onClose={() => setJoinOpen(false)} title="Join a household">
        <Field label="Invite code" testID="join-code-input" value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="e.g. A1B2C3D4" autoFocus />
        <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12, marginBottom: 14 }}>
          Ask the household owner for the 8-character code.
        </Text>
        <Button title="Join household" testID="join-code-submit" loading={joining} disabled={code.trim().length < 4} onPress={joinByCode} />
      </SheetModal>
    </>
  );
}
