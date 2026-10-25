import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Display } from "@/src/components/ui";
import { Select } from "@/src/components/select";
import { Icon } from "@/src/components/icon";
import { useToast } from "@/src/components/toast";

const COUNTRIES = [
  { label: "India", value: "IN", currency: "INR" },
  { label: "United States", value: "US", currency: "USD" },
  { label: "United Kingdom", value: "GB", currency: "GBP" },
  { label: "Eurozone", value: "EU", currency: "EUR" },
  { label: "United Arab Emirates", value: "AE", currency: "AED" },
  { label: "Singapore", value: "SG", currency: "SGD" },
  { label: "Australia", value: "AU", currency: "AUD" },
  { label: "Canada", value: "CA", currency: "CAD" },
];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CHF"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { width: 64, height: 64, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  sub: { color: c.muted, fontFamily: fonts.text, fontSize: 15, lineHeight: 22, marginBottom: 28 },
}));

export default function Onboarding() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();
  const toast = useToast();
  const [country, setCountry] = useState<string | null>("IN");
  const [currency, setCurrency] = useState<string | null>("INR");
  const [busy, setBusy] = useState(false);

  const onCountry = (v: string) => {
    setCountry(v);
    const c = COUNTRIES.find((x) => x.value === v);
    if (c) setCurrency(c.currency);
  };

  const save = async () => {
    if (!country || !currency) return;
    setBusy(true);
    try {
      await api("/users/country", { method: "PUT", body: { country, base_currency: currency } });
      await refreshUser();
    } catch (e: any) {
      toast.show(e.message || "Could not save", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }}>
        <View style={s.hero}>
          <Icon name="Globe" size={32} color={colors.brandPrimary} weight="duotone" />
        </View>
        <Display style={{ fontSize: 34, color: colors.onSurface, marginBottom: 8 }}>Set your region</Display>
        <Text style={s.sub}>
          FinPlanner is India-first with full multi-currency support. Pick your country and base currency — you can change it later.
        </Text>

        <Select
          label="Country"
          testID="country-select"
          value={country}
          options={COUNTRIES.map((c) => ({ label: c.label, value: c.value }))}
          onChange={onCountry}
        />
        <Select
          label="Base currency"
          testID="currency-select"
          value={currency}
          options={CURRENCIES.map((c) => ({ label: c, value: c }))}
          onChange={setCurrency}
        />

        <Button title="Continue" testID="onboarding-continue" onPress={save} loading={busy} style={{ marginTop: 12 }} />
      </ScrollView>
    </View>
  );
}
