"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type Props = { children: ReactNode };

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [offlineMode, setOfflineMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // 初期チェック中
  if (session === undefined) {
    return (
      <div className="app-wrapper">
        <div className="glass p-6 text-white">読み込み中...</div>
      </div>
    );
  }

  // ✅ 未ログインでも、オフラインモードなら通す
  if (!session && offlineMode) {
    return <>{children}</>;
  }

  // 未ログイン（スタート画面）
  if (!session) {
    return (
      <div className="app-wrapper">
        <div className="glass p-6 text-white max-w-md mx-auto mt-10">
          <h1 className="text-2xl font-bold mb-2">めんだこれじ</h1>
          <p className="text-white/70 text-sm mb-6">
            オフラインでも使えます。ログインするとクラウド同期できます。
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() =>
                supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: window.location.origin },
                })
              }
              className="glass px-4 py-3 rounded-xl hover:opacity-90 transition"
            >
              Googleでログイン（同期する）
            </button>

            <button
              onClick={() => setOfflineMode(true)}
              className="px-4 py-3 rounded-xl border border-white/20 text-white/80 hover:bg-white/5 transition"
            >
              ログインせずに使う（オフライン）
            </button>
          </div>

          <p className="text-white/50 text-xs mt-5">
            ※ ログインしなくても端末内（IndexedDB）には保存されます
          </p>
        </div>
      </div>
    );
  }

  // ログイン済み
  return <>{children}</>;
}