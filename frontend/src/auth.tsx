import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

import { api, saveToken, clearToken, loadToken, setToken } from "@/src/api";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  country?: string | null;
  base_currency: string;
  premium: boolean;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUserLocal: (u: User) => void;
};

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

const AUTH_BASE = "https://auth.emergentagent.com";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const processed = useRef<Set<string>>(new Set());

  const exchangeSession = useCallback(async (sessionId: string) => {
    if (processed.current.has(sessionId)) return;
    processed.current.add(sessionId);
    try {
      const data = await api<{ session_token: string; user: User }>("/auth/session", {
        method: "POST",
        body: { session_id: sessionId },
      });
      await saveToken(data.session_token);
      setUser(data.user);
    } catch (e) {
      console.log("session exchange failed", e);
    }
  }, []);

  const checkExisting = useCallback(async () => {
    const token = await loadToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
    } catch (e: any) {
      if (e?.status === 401) {
        await clearToken();
        setToken(null);
      }
      setUser(null);
    }
  }, []);

  // Bootstrap
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (Platform.OS === "web") {
          const hash = window.location.hash || "";
          const search = window.location.search || "";
          const m = (hash + search).match(/[?#&]session_id=([^&#]+)/);
          if (m) {
            await exchangeSession(decodeURIComponent(m[1]));
            const url = new URL(window.location.href);
            url.hash = "";
            url.searchParams.delete("session_id");
            window.history.replaceState(window.history.state, "", url.toString());
          } else {
            await checkExisting();
          }
        } else {
          const initial = await Linking.getInitialURL();
          const m = initial?.match(/[?#&]session_id=([^&#]+)/);
          if (m) {
            await exchangeSession(decodeURIComponent(m[1]));
          } else {
            await checkExisting();
          }
        }
      } finally {
        setLoading(false);
      }
    })();

    if (Platform.OS !== "web") {
      const sub = Linking.addEventListener("url", ({ url }) => {
        const m = url.match(/[?#&]session_id=([^&#]+)/);
        if (m) exchangeSession(decodeURIComponent(m[1]));
      });
      return () => sub.remove();
    }
  }, [exchangeSession, checkExisting]);

  const signIn = useCallback(async () => {
    if (Platform.OS === "web") {
      const redirectUrl = window.location.origin + "/";
      window.location.href = `${AUTH_BASE}/?redirect=${encodeURIComponent(redirectUrl)}`;
      return;
    }
    const redirectUrl = Linking.createURL("");
    const authUrl = `${AUTH_BASE}/?redirect=${encodeURIComponent(redirectUrl)}`;
    let captured: string | null = null;
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (/session_id=/.test(url)) captured = url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let url: string | null = null;
      if (result.type === "success" && (result as any).url) url = (result as any).url;
      if (!url && captured) url = captured;
      if (!url) url = await Linking.getInitialURL();
      const m = url?.match(/[?#&]session_id=([^&#]+)/);
      if (m) await exchangeSession(decodeURIComponent(m[1]));
    } finally {
      sub.remove();
    }
  }, [exchangeSession]);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== "ios") return;
    const AppleAuthentication = await import("expo-apple-authentication");
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error("Apple did not return an identity token");
    const fullName =
      [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ") || null;
    const data = await api<{ session_token: string; user: User }>("/auth/apple", {
      method: "POST",
      body: { identity_token: credential.identityToken, name: fullName, email: credential.email },
    });
    await saveToken(data.session_token);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clearToken();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInWithApple, signOut, refreshUser, setUserLocal: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
