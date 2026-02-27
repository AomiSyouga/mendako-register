import { ArchivedEvent, EventState, Product, Wallet } from "./types";
import {
  idbLoadState, idbSaveState,
  idbLoadWallets, idbSaveWallets,
  idbLoadProducts, idbSaveProducts,
} from "./db";

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
  archivedEvents: [],
};

/* =========================
   Event State
========================= */

export async function loadState(): Promise<EventState> {
  const data = await idbLoadState();
  if (!data) return defaultState;
  return {
    ...defaultState,
    ...data,
    cashFloatByWallet: data.cashFloatByWallet ?? {},
    archivedEvents: data.archivedEvents ?? [],
  };
}

export async function saveState(state: EventState): Promise<void> {
  await idbSaveState(state);
}

/* =========================
   完全リセット
========================= */

export async function clearEventCompletely(): Promise<void> {
  await idbSaveState(defaultState);
}

export async function clearRegisterOnly(): Promise<void> {
  const cur = await loadState();
  await saveState({
    ...cur,
    startAt: null,
    endAt: null,
    cashFloat: 0,
    cashFloatByWallet: {},
  });
}

/* =========================
   イベント締め → アーカイブへ移す
   ※pure関数のまま（saveStateはuseStoreのuseEffectが担う）
========================= */

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
    cashFloatByWallet: {},
    sales: [],
    gifts: [],
    archivedEvents: [...(state.archivedEvents ?? []), archived],
  };
}

/* =========================
   Wallets
========================= */

export async function loadWallets(): Promise<Wallet[]> {
  return (await idbLoadWallets()) ?? [];
}
export async function saveWallets(wallets: Wallet[]): Promise<void> {
  await idbSaveWallets(wallets);
}

/* =========================
   Products
========================= */

export async function loadProducts(): Promise<Product[]> {
  return (await idbLoadProducts()) ?? [];
}
export async function saveProducts(products: Product[]): Promise<void> {
  await idbSaveProducts(products);
}