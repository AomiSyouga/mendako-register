import { supabase } from "./supabaseClient";
import {
  idbLoadState, idbSaveState,
  idbLoadWallets, idbSaveWallets,
  idbLoadProducts, idbSaveProducts,
} from "./db";
import { defaultState } from "./storage";
import { ArchivedEvent, EventState, Product, Wallet } from "./types";

type TableName = "event_state" | "wallets" | "products";

async function upsertTable(
  table: TableName,
  userId: string,
  data: unknown
): Promise<void> {
  await supabase.from(table).upsert(
    { user_id: userId, data, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

/** archivedEventsをidで重複排除してマージ（aを優先、順序保持） */
function mergeArchived(a: ArchivedEvent[], b: ArchivedEvent[]): ArchivedEvent[] {
  const seen = new Set<string>();
  return [...a, ...b].filter((ev) => {
    if (seen.has(ev.id)) return false;
    seen.add(ev.id);
    return true;
  });
}

/* =========================
   IndexedDB → Supabase
   archivedEventsはクラウドとマージしてから保存（消失防止）
========================= */

export async function pushToSupabase(userId: string): Promise<void> {
  const [localState, wallets, products] = await Promise.all([
    idbLoadState(),
    idbLoadWallets(),
    idbLoadProducts(),
  ]);

  const state = localState ?? defaultState;

  // クラウドのarchivedEventsを取得してマージ（他デバイスで追加分を消さない）
  const cloudRes = await supabase
    .from("event_state")
    .select("data")
    .eq("user_id", userId)
    .single();
  const cloudArchived: ArchivedEvent[] =
    (cloudRes.data?.data as EventState | undefined)?.archivedEvents ?? [];

  const mergedState: EventState = {
    ...state,
    archivedEvents: mergeArchived(state.archivedEvents ?? [], cloudArchived),
  };

  // IDBも最新にしておく
  await idbSaveState(mergedState);

  await Promise.all([
    upsertTable("event_state", userId, mergedState),
    upsertTable("wallets", userId, wallets ?? []),
    upsertTable("products", userId, products ?? []),
  ]);
}

/* =========================
   Supabase → IndexedDB
   archivedEventsはローカルとマージ、現在イベントはローカル優先
========================= */

export async function pullFromSupabase(userId: string): Promise<void> {
  const [stateRes, walletsRes, productsRes] = await Promise.all([
    supabase.from("event_state").select("data").eq("user_id", userId).single(),
    supabase.from("wallets").select("data").eq("user_id", userId).single(),
    supabase.from("products").select("data").eq("user_id", userId).single(),
  ]);

  if (stateRes.data) {
    const cloudState = stateRes.data.data as EventState;
    const localState = (await idbLoadState()) ?? defaultState;

    // archivedEventsはidベースでマージ（どちらの履歴も失わない）
    const mergedArchived = mergeArchived(
      localState.archivedEvents ?? [],
      cloudState.archivedEvents ?? []
    );

    // 現在進行中のイベントはローカルを優先（salesが消えないように）
    const mergedState: EventState = {
      ...defaultState,
      ...cloudState,
      eventName: localState.eventName || cloudState.eventName,
      eventDate: localState.eventDate || cloudState.eventDate,
      startAt: localState.startAt ?? cloudState.startAt,
      endAt: localState.endAt ?? cloudState.endAt,
      cashFloat: localState.cashFloat || cloudState.cashFloat,
      cashFloatByWallet:
        Object.keys(localState.cashFloatByWallet ?? {}).length > 0
          ? localState.cashFloatByWallet
          : (cloudState.cashFloatByWallet ?? {}),
      sales: (localState.sales ?? []).length > 0 ? localState.sales : (cloudState.sales ?? []),
      gifts: (localState.gifts ?? []).length > 0 ? localState.gifts : (cloudState.gifts ?? []),
      archivedEvents: mergedArchived,
    };

    await idbSaveState(mergedState);
  }

  if (walletsRes.data) {
    const localWallets = (await idbLoadWallets()) ?? [];
    if (localWallets.length === 0) {
      // ローカルにウォレットがない場合のみクラウドから取得（変更がpullで復活しないように）
      await idbSaveWallets(walletsRes.data.data as Wallet[]);
    }
    // ローカルにウォレットがある場合はpush側で同期（一方向）
  }

  if (productsRes.data) {
    const localProducts = (await idbLoadProducts()) ?? [];
    if (localProducts.length === 0) {
      // ローカルに商品がない場合のみクラウドから取得（削除がpullで復活しないように）
      await idbSaveProducts(productsRes.data.data as Product[]);
    }
    // ローカルに商品がある場合はpush側で同期（一方向）
  }
}

/* =========================
   products / wallets のみ即時push
   追加・編集・削除から呼ぶ
========================= */

export async function pushProductsToSupabase(userId: string): Promise<void> {
  const products = await idbLoadProducts();
  await upsertTable("products", userId, products ?? []);
}

export async function pushWalletsToSupabase(userId: string): Promise<void> {
  const wallets = await idbLoadWallets();
  await upsertTable("wallets", userId, wallets ?? []);
}
