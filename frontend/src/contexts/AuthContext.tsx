import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/src/supabase";
import { api } from "@/src/api";
import { registerForPush } from "@/src/push";

type User = {
  id: string;
  email?: string | null;
  username: string;
  partner_id?: string | null;
  birthday?: string | null;
  anniversary?: string | null;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

async function fetchProfile(throwOnError = false): Promise<User | null> {
  try {
    const res = await api.get("/auth/me");
    return res.data as User;
  } catch (e) {
    if (throwOnError) throw e;
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) {
        if (session) {
          const profile = await fetchProfile();
          setUser(profile);
          if (profile) registerForPush(profile.id).catch(() => {});
        }
        setLoading(false);
      }
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session) {
        const profile = await fetchProfile();
        if (mounted) setUser(profile);
        if (profile) registerForPush(profile.id).catch(() => {});
      }
      else setUser(null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const refreshUser = async () => { setUser(await fetchProfile()); };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(error.message);
    const profile = await fetchProfile(true);
    if (!profile) throw new Error("Signed in but could not load your profile.");
    setUser(profile);
    if (profile) registerForPush(profile.id).catch(() => {});
  };

  const signUp = async (email: string, username: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { username: username.trim() } },
    });
    if (error) throw new Error(error.message);
    // If email confirmations are disabled in Supabase, session is active now.
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const profile = await fetchProfile();
      setUser(profile);
      if (profile) registerForPush(profile.id).catch(() => {});
    }
    else throw new Error("Check your email to confirm your account, then sign in.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
