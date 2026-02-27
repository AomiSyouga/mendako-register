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
import { pushToSupabase } from "@/lib/syncEngine";
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

  // 初回ロード（IndexedDB）
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
    return () => { cancelled = true; };
  }, []);

  // 認証状態の監視
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      userIdRef.current = data.session?.user?.id ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      userIdRef.current = session?.user?.id ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  // state変更時にIndexedDBへ保存
  useEffect(() => {
    if (!ready) return;
    idbSaveState(state).catch(() => {});
  }, [ready, state]);

  // wallets変更時にIndexedDBへ保存
  useEffect(() => {
    if (!ready) return;
    idbSaveWallets(wallets).catch(() => {});
  }, [ready, wallets]);

  // products変更時にIndexedDBへ保存
  useEffect(() => {
    if (!ready) return;
    idbSaveProducts(products).catch(() => {});
  }, [ready, products]);

  // Register.tsxのsetStateと同じ使い方でOK
  const setState = useCallback(
    (updater: EventState | ((prev: EventState) => EventState)) => {
      setState_((prev) =>
        typeof updater === "function" ? updater(prev) : updater
      );
    },
    []
  );

  const setWallets = useCallback(
    (updater: Wallet[] | ((prev: Wallet[]) => Wallet[])) => {
      setWallets_((prev) =>
        typeof updater === "function" ? updater(prev) : updater
      );
    },
    []
  );

  const setProducts = useCallback(
    (updater: Product[] | ((prev: Product[]) => Product[])) => {
      setProducts_((prev) =>
        typeof updater === "function" ? updater(prev) : updater
      );
    },
    []
  );

  // 「しめる」時だけSupabaseにpush（未ログインなら何もしない）
  const pushSync = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    await pushToSupabase(uid);
  }, []);

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