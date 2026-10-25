import React from "react";
import {
  House, Wallet, CreditCard, ChartPieSlice, DotsThreeOutline, Plus, ForkKnife,
  ShoppingCart, Car, Bag, Lightning, Heartbeat, FilmSlate, Money, Coins, Tag,
  ArrowsLeftRight, Receipt, Bank, Money as Cash, ArrowUp, ArrowDown, Gear,
  SignOut, Crown, FileArrowDown, ClockCounterClockwise, Trash, CaretRight,
  Users, Target, Calendar, TrendUp, ChartLineUp, X, Check, PencilSimple,
  CheckCircle, GoogleLogo, Globe, UploadSimple, ArrowLeft, Repeat, Sparkle,
  CaretDown, WarningCircle, Minus, ShareNetwork, Copy, EnvelopeSimple, UserPlus,
  UserMinus, ShieldCheck, Key, ArrowsClockwise, Warning,
} from "phosphor-react-native";

const MAP: Record<string, any> = {
  House, Wallet, CreditCard, ChartPieSlice, DotsThreeOutline, Plus, ForkKnife,
  ShoppingCart, Car, Bag, Lightning, Heartbeat, FilmSlate, Money, Coins, Tag,
  ArrowsLeftRight, Receipt, Bank, Cash, ArrowUp, ArrowDown, Gear, SignOut, Crown,
  FileArrowDown, ClockCounterClockwise, Trash, CaretRight, Users, Target, Calendar,
  TrendUp, ChartLineUp, X, Check, PencilSimple, CheckCircle, GoogleLogo, Globe,
  UploadSimple, ArrowLeft, Repeat, Sparkle, CaretDown, WarningCircle, Minus,
  ShareNetwork, Copy, EnvelopeSimple, UserPlus, UserMinus, ShieldCheck, Key,
  ArrowsClockwise, Warning,
};

export type IconName = keyof typeof MAP;

export function Icon({
  name,
  size = 22,
  color = "#FFFFFF",
  weight = "regular",
}: {
  name: string;
  size?: number;
  color?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}) {
  const Cmp = MAP[name] || Tag;
  return <Cmp size={size} color={color} weight={weight} />;
}
