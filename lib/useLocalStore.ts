"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventState, Wallet, Product } from "@/lib/types";
import {
  idbLoadState,
  idbSaveState,
  idbLoadWallets,
  idbSaveWallets,
  idbLoadProducts,
  idbSaveProducts,
} from "@/lib/db";
import { pushToSupabase, pullFromSupabase } from "@/lib/syncEngine";
import { supabase } from "@/lib/supabaseClient";

const DEFAULT_STATE: EventState = {
  eventName: "",
  eventDate: new Date().toISOString().slice(0, 10),
  startAt: null,
  endAt: null,
  cashFloat: 0,
  cashFloatByWallet: {},
  sales: [],
  gifts: [],
  archivedEvents: [],
};

export function useLocalStore() {
  const [ready, setReady] = useState(false);
  const [state, setState_] = useState<EventState>(DEFAULT_STATE);
  const [wallets, setWallets_] = useState<Wallet[]>([]);
  const [products, setProducts_] = useState<Product[]>([]);
  const userIdRef = useRef<string | null>(null);

  // ===== 自動同期制御 =====
  const syncTimerRef = useRef<number | null>(null);
  const syncingRef = useRef(false);
  const pendingRef = useRef(false);

  const autoSync = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    // 送信中なら「あとで再送」だけ立てる
    if (syncingRef.current) {
      pendingRef.current = true;
      return;
    }

    syncingRef.current = true;
    pendingRef.current = false;

    try {
      // いったん “今の実装” を壊さないために uid だけ渡す
      // （pushToSupabase 側が IndexedDB から読む設計でもOK）
      const autoSync = useCallback(async () => {
  const uid = userIdRef.current;
  if (!uid) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  if (syncingRef.current) {
    pendingRef.current = true;
    return;
  }

  syncingRef.current = true;
  pendingRef.current = false;

  try {
    // ★先にIndexedDBへ確定保存（pushToSupabaseがIDB読む前提だから）
    await Promise.all([
      idbSaveState(state),
      idbSaveWallets(wallets),
      idbSaveProducts(products),
    ]).catch(() => {});

    await pushToSupabase(uid);
  } catch {
    pendingRef.current = true;
  } finally {
    syncingRef.current = false;

    if (pendingRef.current) {
      pendingRef.current = false;
      await autoSync();
    }
  }
}, [state, wallets, products]);
    } catch {
      // 一時的に失敗したら次回また送る
      pendingRef.current = true;
    } finally {
      syncingRef.current = false;

      // 送信中に変更が入ってたら、続けてもう1回送る
      if (pendingRef.current) {
        pendingRef.current = false;
        await autoSync();
      }
    }
  }, []);

  const scheduleAutoSync = useCallback(() => {
    const uid = userIdRef.current;
    if (!uid) return;

    // 最後の変更から 1.5 秒後にまとめて同期
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      autoSync();
    }, 1500);
  }, [autoSync]);

  // ===== 初回ロード（IndexedDB）=====
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [s, w, p] = await Promise.all([
          idbLoadState(),
          idbLoadWallets(),
          idbLoadProducts(),
        ]);
        if (cancelled) return;

        setState_({ ...DEFAULT_STATE, ...(s ?? {}) });
        setWallets_(w ?? []);
        setProducts_(p ?? []);
      } catch {
        // 失敗してもアプリは動かす
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ===== 認証状態の監視 =====
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      userIdRef.current = data.session?.user?.id ?? null;
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      userIdRef.current = session?.user?.id ?? null;

      // ログインした瞬間にクラウドから引っ張る
if (userIdRef.current) {
  pullFromSupabase(userIdRef.current).then(() => {
    idbLoadState().then(s => s && setState_({ ...DEFAULT_STATE, ...s }));
    idbLoadWallets().then(w => w && setWallets_(w));
    idbLoadProducts().then(p => p && setProducts_(p));
  }).catch(() => {});
}
    });

    return () => subscription.unsubscribe();
  }, [scheduleAutoSync]);

  // ===== ローカル保存（IndexedDB）=====
  useEffect(() => {
    if (!ready) return;
    idbSaveState(state).catch(() => {});
  }, [ready, state]);

  useEffect(() => {
    if (!ready) return;
    idbSaveWallets(wallets).catch(() => {});
  }, [ready, wallets]);

  useEffect(() => {
    if (!ready) return;
    idbSaveProducts(products).catch(() => {});
  }, [ready, products]);

  // ===== 変更が起きたら自動同期を予約（ログイン中のみ）=====
  useEffect(() => {
    if (!ready) return;
    if (!userIdRef.current) return;
    scheduleAutoSync();
  }, [ready, state, wallets, products, scheduleAutoSync]);

  // ===== オンライン復帰したら同期 =====
  useEffect(() => {
    const onOnline = () => {
      if (userIdRef.current) autoSync();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [autoSync]);

  // ===== タブ閉じる/非表示で “最後の保険” 同期 =====
  useEffect(() => {
    const flush = () => {
      if (userIdRef.current) {
        // ここは await できないので best-effort
        autoSync();
      }
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", flush);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", flush);
    };
  }, [autoSync]);

  // ===== Register.tsx と同じ setState の使い方 =====
  const setState = useCallback(
  (updater: EventState | ((prev: EventState) => EventState)) => {
    setState_((prev) => {
      const next = typeof updater === "function" ? (updater as any)(prev) : updater;

      // ★ここでIDBへ確定保存（stateが確実にnext）
      idbSaveState(next).catch(() => {});

      return next;
    });
  },
  []
);

  const setWallets = useCallback(
    (updater: Wallet[] | ((prev: Wallet[]) => Wallet[])) => {
      setWallets_((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    []
  );

  const setProducts = useCallback(
    (updater: Product[] | ((prev: Product[]) => Product[])) => {
      setProducts_((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    []
  );

  // 「しめる」時の手動push（ログイン中だけ）
  const pushSync = useCallback(async () => {
  const uid = userIdRef.current;
  if (!uid) return;

  // ★先にIDBへ確定保存
  await Promise.all([
    idbSaveState(state),
    idbSaveWallets(wallets),
    idbSaveProducts(products),
  ]).catch(() => {});

  await pushToSupabase(uid);
}, [state, wallets, products]);

  return {
    ready,
    state,
    setState,
    wallets,
    setWallets,
    products,
    setProducts,
    pushSync,
  };
}