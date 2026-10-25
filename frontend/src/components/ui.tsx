import React from "react";
import {
  Text, View, Pressable, ActivityIndicator, TextInput, StyleProp, ViewStyle, TextStyle,
} from "react-native";

import { makeStyles, useTheme, fonts } from "@/src/theme";
import { Icon } from "@/src/components/icon";

export function AppText({ style, children, ...p }: any) {
  const { colors } = useTheme();
  return (
    <Text style={[{ color: colors.onSurface, fontFamily: fonts.text, fontSize: 14 }, style]} {...p}>
      {children}
    </Text>
  );
}

export function Display({ style, children, ...p }: any) {
  const { colors } = useTheme();
  return (
    <Text style={[{ color: colors.onSurface, fontFamily: fonts.displayBold, letterSpacing: 0.3 }, style]} {...p}>
      {children}
    </Text>
  );
}

const useBtn = makeStyles((c) => ({
  base: {
    minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8, paddingHorizontal: 20,
  },
  primary: { backgroundColor: c.brandPrimary },
  secondary: { backgroundColor: c.surfaceTertiary },
  ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.border },
  danger: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.error },
  label: { fontFamily: fonts.textBold, fontSize: 16 },
}));

export function Button({
  title, onPress, variant = "primary", loading, disabled, icon, style, testID,
}: {
  title: string; onPress?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean; disabled?: boolean; icon?: string; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const s = useBtn();
  const { colors } = useTheme();
  const bg =
    variant === "primary" ? s.primary : variant === "secondary" ? s.secondary : variant === "danger" ? s.danger : s.ghost;
  const fg =
    variant === "primary" ? colors.onBrandPrimary : variant === "danger" ? colors.error : colors.onSurface;
  return (
    <Pressable
      testID={testID}
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [s.base, bg, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} weight="bold" /> : null}
          <Text style={[s.label, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const useCard = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border },
}));

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useCard();
  return <View style={[s.card, style]}>{children}</View>;
}

const useField = makeStyles((c) => ({
  wrap: { marginBottom: 14 },
  label: { color: c.onSurfaceTertiary, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: c.surfaceTertiary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    color: c.onSurface, fontFamily: fonts.text, fontSize: 16, borderWidth: 1, borderColor: c.border,
  },
}));

export function Field({
  label, value, onChangeText, placeholder, keyboardType, style, testID, autoFocus,
}: {
  label?: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: any; style?: StyleProp<TextStyle>; testID?: string; autoFocus?: boolean;
}) {
  const s = useField();
  const { colors } = useTheme();
  return (
    <View style={s.wrap}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        style={[s.input, style]}
      />
    </View>
  );
}

export function EmptyState({ icon, title, subtitle, children }: { icon: string; title: string; subtitle?: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 24 }}>
      <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <Icon name={icon} size={34} color={colors.brandPrimary} weight="duotone" />
      </View>
      <Display style={{ fontSize: 22, color: colors.onSurface, marginBottom: 6 }}>{title}</Display>
      {subtitle ? <AppText style={{ color: colors.muted, textAlign: "center", marginBottom: 16 }}>{subtitle}</AppText> : null}
      {children}
    </View>
  );
}

export function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress?: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: "center", justifyContent: "center",
        backgroundColor: active ? colors.brandPrimary : colors.surfaceTertiary,
        borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border, flexShrink: 0,
      }}
    >
      <Text style={{ color: active ? colors.onBrandPrimary : colors.onSurfaceTertiary, fontFamily: fonts.textMedium, fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ToggleRow({ title, subtitle, active, onPress, testID }: { title: string; subtitle?: string; active: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        backgroundColor: colors.surfaceTertiary, borderRadius: 12, padding: 14, marginBottom: 14,
        borderWidth: 1, borderColor: colors.border,
      }}
    >
      <View>
        <Text style={{ color: colors.onSurface, fontFamily: fonts.textMedium, fontSize: 15 }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 12 }}>{subtitle}</Text> : null}
      </View>
      <Icon name={active ? "CheckCircle" : "Minus"} size={24} color={active ? colors.success : colors.muted} weight="fill" />
    </Pressable>
  );
}
