import React from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { makeStyles, fonts, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/icon";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

const useStyles = makeStyles((c) => ({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  key: {
    width: "33.333%", height: 68, alignItems: "center", justifyContent: "center",
  },
  keyText: { color: c.onSurface, fontFamily: fonts.display, fontSize: 30 },
}));

export function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const s = useStyles();
  const { colors } = useTheme();

  const press = (k: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (k === "del") {
      onChange(value.length <= 1 ? "0" : value.slice(0, -1));
      return;
    }
    if (k === ".") {
      if (value.includes(".")) return;
      onChange(value + ".");
      return;
    }
    // digit
    if (value === "0") {
      onChange(k);
      return;
    }
    const parts = value.split(".");
    if (parts[1] && parts[1].length >= 2) return;
    onChange(value + k);
  };

  return (
    <View style={s.grid}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          testID={`keypad-${k}`}
          onPress={() => press(k)}
          style={({ pressed }) => [s.key, { opacity: pressed ? 0.5 : 1 }]}
        >
          {k === "del" ? (
            <Icon name="ArrowLeft" size={26} color={colors.onSurfaceTertiary} weight="bold" />
          ) : (
            <Text style={s.keyText}>{k}</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}
