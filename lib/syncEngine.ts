import { supabase } from "./supabaseClient";
import {
  idbLoadState, idbSaveState,
  idbLoadWallets, idbSaveWallets,
  idbLoadProducts, idbSaveProducts,
} from "./db";
import { defaultState } from "./storage";
import { EventState, Product, Wallet } from "./types";

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

/* =========================
   IndexedDB → Supabase（手動バックアップ用）
   「しめる」ボタンから呼ぶ
========================= */

export async function pushToSupabase(userId: string): Promise<void> {
  const [state, wallets, products] = await Promise.all([
    idbLoadState(),
    idbLoadWallets(),
    idbLoadProducts(),
  ]);
  await Promise.all([
    upsertTable("event_state", userId, state ?? defaultState),
    upsertTable("wallets", userId, wallets ?? []),
    upsertTable("products", userId, products ?? []),
  ]);
}

/* =========================
   Supabase → IndexedDB（ログイン後の初回同期）
========================= */

export async function pullFromSupabase(userId: string): Promise<void> {
  const [stateRes, walletsRes, productsRes] = await Promise.all([
    supabase.from("event_state").select("data").eq("user_id", userId).single(),
    supabase.from("wallets").select("data").eq("user_id", userId).single(),
    supabase.from("products").select("data").eq("user_id", userId).single(),
  ]);

  if (stateRes.data) {
    await idbSaveState({ ...defaultState, ...(stateRes.data.data as EventState) });
  }
  if (walletsRes.data) {
    await idbSaveWallets(walletsRes.data.data as Wallet[]);
  }
  if (productsRes.data) {
    await idbSaveProducts(productsRes.data.data as Product[]);
  }
}