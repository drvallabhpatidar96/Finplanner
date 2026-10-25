import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { makeStyles, fonts, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/icon";

const useStyles = makeStyles((c) => ({
  wrap: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 12, gap: 6 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 24 },
}));

export function Header({
  title, right, onBack, showBack = true,
}: {
  title: string; right?: React.ReactNode; onBack?: () => void; showBack?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={s.row}>
        {showBack ? (
          <Pressable
            testID="header-back"
            style={({ pressed }) => [s.back, { backgroundColor: pressed ? colors.surfaceTertiary : "transparent" }]}
            onPress={() => (onBack ? onBack() : router.back())}
          >
            <Icon name="ArrowLeft" size={24} color={colors.onSurface} weight="bold" />
          </Pressable>
        ) : null}
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {right}
      </View>
    </View>
  );
}
