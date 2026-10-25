import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, fonts, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/icon";

type ToastType = "success" | "error" | "info";
type ToastCtx = { show: (msg: string, type?: ToastType) => void };
const Ctx = createContext<ToastCtx>({ show: () => {} });
export const useToast = () => useContext(Ctx);

const useStyles = makeStyles((c) => ({
  container: { position: "absolute", left: 16, right: 16, zIndex: 9999 },
  toast: {
    flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1,
  },
  text: { flex: 1, color: c.onSurface, fontFamily: fonts.textMedium, fontSize: 14 },
}));

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState("");
  const [type, setType] = useState<ToastType>("info");
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const show = useCallback((message: string, t: ToastType = "info") => {
    setMsg(message);
    setType(t);
    setVisible(true);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setVisible(false));
    }, 2600);
  }, [opacity]);

  const border = type === "success" ? colors.success : type === "error" ? colors.error : colors.border;
  const icon = type === "success" ? "CheckCircle" : type === "error" ? "WarningCircle" : "Sparkle";
  const iconColor = type === "success" ? colors.success : type === "error" ? colors.error : colors.brandPrimary;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {visible && (
        <Animated.View style={[s.container, { top: insets.top + 8, opacity }]} pointerEvents="none">
          <View style={[s.toast, { backgroundColor: colors.surfaceSecondary, borderColor: border }]}>
            <Icon name={icon} size={20} color={iconColor} weight="fill" />
            <Text style={s.text}>{msg}</Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}
