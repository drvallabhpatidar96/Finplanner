import React from "react";
import { Modal, Pressable, Text, View, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, fonts, useTheme } from "@/src/theme";
import { useResponsive } from "@/src/responsive";

const useStyles = makeStyles((c) => ({
  backdropBottom: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  backdropCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  dialog: { backgroundColor: c.surfaceSecondary, borderRadius: 20, padding: 20, width: "100%", maxWidth: 460, borderWidth: 1, borderColor: c.border },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: 12 },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22, marginBottom: 12 },
}));

// Bottom sheet on mobile; centered dialog on wide web. Used for all add/edit forms & pickers.
export function SheetModal({
  visible, onClose, title, children, testID, maxHeight = 460,
}: {
  visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; testID?: string; maxHeight?: number;
}) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();

  return (
    <Modal visible={visible} transparent animationType={isWide ? "fade" : "slide"} onRequestClose={onClose}>
      <Pressable style={isWide ? s.backdropCenter : s.backdropBottom} onPress={onClose} testID={testID}>
        <Pressable
          style={isWide ? s.dialog : [s.sheet, { paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}
        >
          {!isWide ? <View style={s.handle} /> : null}
          {title ? <Text style={s.title}>{title}</Text> : null}
          <ScrollView style={{ maxHeight }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
