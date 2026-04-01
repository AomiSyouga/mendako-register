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
import { pushToSupabase, pullFromSupabase, pushProductsToSupabase, pushWalletsToSupabase } from "@/lib/syncEngine";
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
  // 最新値をrefで保持（state updater外でasync処理する際に使う）
  const walletsRef = useRef<Wallet[]>([]);
  const productsRef = useRef<Product[]>([]);

  // ===== 自動同期制御 =====
  const syncTimerRef = useRef<number | null>(null);
  const syncingRef = useRef(false);
  const pendingRef = useRef(false);

  const autoSync = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    // 送信中なら「あとで再送」フラグだけ立てる
    if (syncingRef.current) {
      pendingRef.current = true;
      return;
    }

    syncingRef.current = true;
    pendingRef.current = false;

    try {
      // IDB保存はuseEffectが担うためここでは省略（クロージャの古いstateでIDBを上書きしない）
      await pushToSupabase(uid);
    } catch {
      // 失敗したら次回また送る
      pendingRef.current = true;
    } finally {
      syncingRef.current = false;

      // 再帰はせず、1.5秒後に再試行（stack overflowを防ぐ）
      if (pendingRef.current) {
        pendingRef.current = false;
        setTimeout(() => autoSync(), 1500);
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
        walletsRef.current = w ?? [];
        setWallets_(w ?? []);
        productsRef.current = p ?? [];
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
  // 「前回ログインしていたか」を追跡するref
  const wasLoggedInRef = useRef(false);

  useEffect(() => {
    // 初回セッション確認
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      userIdRef.current = uid;

      if (uid) {
        // マウント時は常にpull（archivedEventsはマージ、現在イベントはローカル優先）
        pullFromSupabase(uid)
          .then(() => {
            idbLoadState().then((s2) => s2 && setState_({ ...DEFAULT_STATE, ...s2 }));
            idbLoadWallets().then((w) => { if (w) { walletsRef.current = w; setWallets_(w); } });
            idbLoadProducts().then((p) => { if (p) { productsRef.current = p; setProducts_(p); } });
          })
          .catch(() => {});

        wasLoggedInRef.current = true;
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      userIdRef.current = uid;

      // ログアウト→ログインの時だけpull（SIGNED_INイベント、かつ前回未ログイン状態）
      if (event === "SIGNED_IN" && uid && !wasLoggedInRef.current) {
        pullFromSupabase(uid)
          .then(() => {
            idbLoadState().then((s) => s && setState_({ ...DEFAULT_STATE, ...s }));
            idbLoadWallets().then((w) => { if (w) { walletsRef.current = w; setWallets_(w); } });
            idbLoadProducts().then((p) => { if (p) { productsRef.current = p; setProducts_(p); } });
          })
          .catch(() => {});
        wasLoggedInRef.current = true;
      }

      if (event === "SIGNED_OUT") {
        wasLoggedInRef.current = false;
      }
    });

    return () => subscription.unsubscribe();
  }, [scheduleAutoSync]);

  // ===== ローカル保存（IndexedDB）=====
  // state（売上など頻繁に変わるもの）はuseEffectで保存
  useEffect(() => {
    if (!ready) return;
    idbSaveState(state).catch(() => {});
  }, [ready, state]);
  // wallets/productsはsetWallets/setProductsが直接IDB保存するのでuseEffectは不要
  // （useEffectで空配列を書くとnullチェックが壊れ、新デバイスでpullがスキップされる）

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

  // ===== タブ閉じる/非表示で "最後の保険" 同期 =====
  useEffect(() => {
    const flush = () => {
      if (userIdRef.current) {
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

  // ===== setState =====
  const setState = useCallback(
    (updater: EventState | ((prev: EventState) => EventState)) => {
      setState_((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: EventState) => EventState)(prev)
            : updater;
        return next;
      });
    },
    []
  );

  const setWallets = useCallback(
    (updater: Wallet[] | ((prev: Wallet[]) => Wallet[])) => {
      // refから現在値を取得してnextを計算（state updater外でasync処理するため）
      const next = typeof updater === "function" ? updater(walletsRef.current) : updater;
      walletsRef.current = next;
      setWallets_(next);
      // state updaterの外でIDB保存+push（updater内のasyncはReact的にNG）
      const uid = userIdRef.current;
      idbSaveWallets(next)
        .then(() => { if (uid) return pushWalletsToSupabase(uid); })
        .catch(() => {});
    },
    []
  );

  const setProducts = useCallback(
    (updater: Product[] | ((prev: Product[]) => Product[])) => {
      const next = typeof updater === "function" ? updater(productsRef.current) : updater;
      productsRef.current = next;
      setProducts_(next);
      const uid = userIdRef.current;
      idbSaveProducts(next)
        .then(() => { if (uid) return pushProductsToSupabase(uid); })
        .catch(() => {});
    },
    []
  );

  // ===== 「しめる」時の手動push（ログイン中だけ）=====
  // handleCloseがIDBに正しいstateを保存済みなので、ここではIDB再保存しない。
  // クロージャのstateは古い可能性があり、IDBを上書きするとデータロスになる。
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
