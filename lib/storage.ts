import { ArchivedEvent, EventState, Product, Wallet } from "./types";

const STATE_KEY = "mendako_v0_state";
const WALLETS_KEY = "mendako_v0_wallets";
const PRODUCT_KEY = "mendako_v0_products";

/* =========================
   初期イベント状態
========================= */

export const defaultState: EventState = {
  eventName: "",
  eventDate: new Date().toISOString().slice(0, 10),
  startAt: null,
  endAt: null,
  cashFloat: 0,
  cashFloatByWallet: {},
  sales: [],
  gifts: [],
  archivedEvents: [],  // ✅ 追加
};

/* =========================
   Event State
========================= */

export function loadState(): EventState {
  if (typeof window === "undefined") return defaultState;

  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return defaultState;

    const parsed = JSON.parse(raw) as EventState;

    return {
      ...defaultState,
      ...parsed,
      cashFloatByWallet: parsed.cashFloatByWallet ?? {},
      archivedEvents: parsed.archivedEvents ?? [],  // ✅ 追加（旧データ互換）
    };
  } catch {
    return defaultState;
  }
}

export function saveState(state: EventState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

/* =========================
   完全リセット
========================= */

export function clearEventCompletely() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STATE_KEY, JSON.stringify(defaultState));
}

export function clearRegisterOnly() {
  if (typeof window === "undefined") return;

  const cur = loadState();

  const next: EventState = {
    ...cur,
    startAt: null,
    endAt: null,
    cashFloat: 0,
    cashFloatByWallet: {},
    // ✅ sales / gifts はそのまま残す（まだアーカイブ前の継続用途のため）
  };

  saveState(next);
  localStorage.removeItem("mendako_endAt");
}

/* =========================
   ✅ 追加：イベント締め → アーカイブへ移す
   「しめる」ボタンの処理でこれを呼ぶ
========================= */

// storage.ts
export function archiveCurrentEvent(state: EventState): EventState {
  const archived: ArchivedEvent = {
    id: `event_${Date.now()}`,
    eventName: state.eventName,
    eventDate: state.eventDate,
    startAt: state.startAt,
    endAt: state.endAt ?? Date.now(),
    cashFloatByWallet: state.cashFloatByWallet,
    sales: state.sales,
    gifts: state.gifts,
  };

  return {
    eventName: "",
    eventDate: new Date().toISOString().slice(0, 10),
    startAt: null,
    endAt: null,
    cashFloat: 0,
    cashFloatByWallet: {},   // ← ここが確実に {} になる
    sales: [],
    gifts: [],
    archivedEvents: [...(state.archivedEvents ?? []), archived],
  };
  // ✅ saveState は呼ばない（useLocalStore の useEffect が自動保存する）
}

/* =========================
   Wallets
========================= */

export function loadWallets(): Wallet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WALLETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Wallet[];
  } catch {
    return [];
  }
}

export function saveWallets(wallets: Wallet[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WALLETS_KEY, JSON.stringify(wallets));
}

/* =========================
   Products
========================= */

export function loadProducts(): Product[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRODUCT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Product[];
  } catch {
    return [];
  }
}

export function saveProducts(products: Product[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PRODUCT_KEY, JSON.stringify(products));
}