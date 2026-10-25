import React, { useEffect } from "react";
import { View, Text, Platform } from "react-native";
import { makeStyles, fonts, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/icon";

const useStyles = makeStyles((c) => ({
  wrap: {
    borderWidth: 1, borderColor: c.border, borderStyle: "dashed", borderRadius: 12,
    backgroundColor: c.surfaceTertiary, paddingVertical: 14, paddingHorizontal: 14,
    // Removed flexDirection row from here to allow the ad to stack below the text
  },
  headerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  badge: { color: c.muted, fontFamily: fonts.textMedium, fontSize: 10, letterSpacing: 1 },
  title: { color: c.onSurfaceTertiary, fontFamily: fonts.textMedium, fontSize: 13 },
}));

// Visually separated placeholder ad slot (shown only to free users).
export function AdSlot({ testID }: { testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();

  // Initialize the AdSense script when the component loads on the web
  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch (e) {
        console.error("AdSense error", e);
      }
    }
  }, []);

  return (
    <View style={s.wrap} testID={testID || "ad-slot"}>
      
      {/* 1. Your Go Premium message (Always visible) */}
      <View style={s.headerRow}>
        <Icon name="Sparkle" size={18} color={colors.muted} />
        <View style={{ flex: 1 }}>
          <Text style={s.badge}>SPONSORED</Text>
          <Text style={s.title}>Your ad could be here · Go Premium to remove</Text>
        </View>
      </View>

      {/* 2. The actual Google Ad (Visible only on Web, sitting below the message) */}
      {Platform.OS === 'web' && (
        <View style={{ marginTop: 12 }}>
          <ins 
            className="adsbygoogle"
            style={{ display: "block", width: "100%" }}
            data-ad-client="ca-pub-9322482314457709" // <-- Replace with your Client ID
            data-ad-slot="6835944963"               // <-- Replace with your Slot ID
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </View>
      )}

    </View>
  );
}
