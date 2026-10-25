import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { makeStyles, fonts, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/icon";
import { SheetModal } from "@/src/components/sheet-modal";

export type Option = { label: string; value: string; sublabel?: string; color?: string };

const useStyles = makeStyles((c) => ({
  wrap: { marginBottom: 14 },
  label: { color: c.onSurfaceTertiary, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: 6 },
  trigger: {
    backgroundColor: c.surfaceTertiary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 15,
    borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  value: { color: c.onSurface, fontFamily: fonts.text, fontSize: 16 },
  placeholder: { color: c.muted, fontFamily: fonts.text, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12 },
  rowLabel: { color: c.onSurface, fontFamily: fonts.textMedium, fontSize: 16 },
  rowSub: { color: c.muted, fontFamily: fonts.text, fontSize: 12 },
}));

export function Select({
  label, placeholder, value, options, onChange, testID,
}: {
  label?: string; placeholder?: string; value: string | null; options: Option[];
  onChange: (v: string) => void; testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={s.wrap}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <Pressable testID={testID} style={s.trigger} onPress={() => setOpen(true)}>
        <Text style={selected ? s.value : s.placeholder}>{selected?.label || placeholder || "Select"}</Text>
        <Icon name="CaretDown" size={16} color={colors.muted} />
      </Pressable>

      <SheetModal visible={open} onClose={() => setOpen(false)} title={label || "Select"} testID={`${testID}-modal`}>
        {options.map((o) => {
          const sel = o.value === value;
          return (
            <Pressable
              key={o.value}
              testID={`${testID}-option-${o.value}`}
              style={[s.row, { backgroundColor: sel ? colors.surfaceTertiary : "transparent" }]}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.color ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: o.color }} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>{o.label}</Text>
                {o.sublabel ? <Text style={s.rowSub}>{o.sublabel}</Text> : null}
              </View>
              {sel ? <Icon name="Check" size={20} color={colors.brandPrimary} weight="bold" /> : null}
            </Pressable>
          );
        })}
      </SheetModal>
    </View>
  );
}
