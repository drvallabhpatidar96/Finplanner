import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";

import { makeStyles, fonts, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { money } from "@/src/format";
import { Header } from "@/src/components/header";
import { Icon } from "@/src/components/icon";
import { Button, EmptyState, Field } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  consent: { flexDirection: "row", gap: 10, backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 14, marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderColor: c.border },
  consentText: { color: c.onSurfaceTertiary, fontFamily: fonts.text, fontSize: 12, lineHeight: 18, flex: 1 },
  preview: { width: "100%", height: 200, borderRadius: 16, marginTop: 16, backgroundColor: c.surfaceSecondary },
  reviewCard: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, marginTop: 16, borderWidth: 1, borderColor: c.border },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider },
  itemName: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, flex: 1 },
  itemAmt: { color: c.onSurface, fontFamily: fonts.textBold, fontSize: 14 },
  label: { color: c.muted, fontFamily: fonts.textBold, fontSize: 12, letterSpacing: 0.5, marginTop: 16, marginBottom: 8, marginHorizontal: 16 },
}));

async function uriToBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = String(reader.result);
      resolve(r.includes(",") ? r.split(",")[1] : r);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function BillScan() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();

  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [merchant, setMerchant] = useState("");
  const [total, setTotal] = useState("");
  const [date, setDate] = useState("");
  const [currency, setCurrency] = useState("INR");

  if (!user?.premium) {
    return (
      <View style={s.root}>
        <Header title="Bill Scan" />
        <EmptyState icon="Crown" title="Premium feature" subtitle="Bill Scan reads a photo or PDF of your bill and extracts the details for you.">
          <Button title="Upgrade to Premium" icon="Crown" testID="billscan-upgrade" onPress={() => router.push("/premium")} />
        </EmptyState>
      </View>
    );
  }

  const runScan = async (base64: string, mime: string, previewUri: string) => {
    setPreview(previewUri);
    setResult(null);
    setScanning(true);
    try {
      const data = await api("/bill-scan", { method: "POST", body: { image_base64: base64, mime_type: mime } });
      setResult(data);
      setMerchant(data.merchant || "");
      setTotal(String(data.total || ""));
      setDate(data.date || new Date().toISOString().slice(0, 10));
      setCurrency(data.currency || "INR");
      toast.show("Bill scanned — review below", "success");
    } catch (e: any) {
      toast.show(e.message || "Could not read the bill", "error");
    } finally {
      setScanning(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain && Platform.OS !== "web") {
        toast.show("Enable photo access in Settings", "error");
        Linking.openSettings();
      } else {
        toast.show("Photo permission needed to scan bills", "error");
      }
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.6 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const b64 = a.base64 || (await uriToBase64(a.uri));
    await runScan(b64, a.mimeType || "image/jpeg", a.uri);
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    try {
      const b64 = await uriToBase64(a.uri);
      await runScan(b64, a.mimeType || "application/pdf", a.uri);
    } catch {
      toast.show("Could not read that file", "error");
    }
  };

  const saveAsTransaction = () => {
    router.replace({
      pathname: "/add-transaction",
      params: { amount: String(parseFloat(total) || 0), note: merchant, date, currency },
    });
  };

  return (
    <View style={s.root}>
      <Header title="Bill Scan" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <View style={s.consent}>
          <Icon name="WarningCircle" size={18} color={colors.muted} />
          <Text style={s.consentText}>
            Your bill is sent for one-time extraction only and is never stored. Review and confirm the details before saving.
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <Button title="Photo" icon="Receipt" variant="secondary" style={{ flex: 1 }} testID="scan-photo" onPress={pickImage} />
          <Button title="PDF / File" icon="UploadSimple" variant="secondary" style={{ flex: 1 }} testID="scan-pdf" onPress={pickPdf} />
        </View>

        {preview && <Image source={{ uri: preview }} style={s.preview} contentFit="contain" />}

        {scanning && (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={{ color: colors.muted, fontFamily: fonts.text, marginTop: 10 }}>Reading your bill…</Text>
          </View>
        )}

        {result && !scanning && (
          <>
            <View style={s.reviewCard}>
              <Field label="Merchant" testID="review-merchant" value={merchant} onChangeText={setMerchant} />
              <Field label="Total" testID="review-total" value={total} onChangeText={setTotal} keyboardType="decimal-pad" />
              <Field label="Date (YYYY-MM-DD)" testID="review-date" value={date} onChangeText={setDate} />
              {result.tax ? (
                <Text style={{ color: colors.muted, fontFamily: fonts.text, fontSize: 13 }}>Tax detected: {money(result.tax, currency, true)}</Text>
              ) : null}
            </View>

            {result.items?.length > 0 && (
              <>
                <Text style={s.label}>LINE ITEMS</Text>
                <View style={s.reviewCard}>
                  {result.items.map((it: any, i: number) => (
                    <View key={i} style={[s.itemRow, { borderBottomWidth: i === result.items.length - 1 ? 0 : 1 }]}>
                      <Text style={s.itemName}>{it.name || "Item"}</Text>
                      <Text style={s.itemAmt}>{money(it.amount || 0, currency, true)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Button title="Save as transaction" icon="Check" testID="save-scanned" style={{ marginTop: 20 }} onPress={saveAsTransaction} />
          </>
        )}

        {!result && !scanning && !preview && (
          <View style={{ paddingTop: 20 }}>
            <EmptyState icon="Receipt" title="Scan a bill" subtitle="Upload a receipt photo or PDF and we'll pull out the merchant, date, total and items." />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
