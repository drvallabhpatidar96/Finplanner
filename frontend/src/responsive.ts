import { Platform, useWindowDimensions } from "react-native";

// Wide = desktop/tablet web layout. Phones & narrow windows keep the mobile UI.
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isWide = isWeb && width >= 900;
  return { isWide, isWeb, width, height };
}

export const CONTENT_MAX_WIDTH = 1180;
