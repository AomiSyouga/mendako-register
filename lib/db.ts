import { openDB, type IDBPDatabase } from "idb";
import type { EventState, Product, Wallet } from "./types";

const DB_NAME = "mendako_db";
const DB_VERSION = 1;
const KEY = "current";

type MendakoDB = {
  event_state: { key: string; value: EventState };
  wallets: { key: string; value: Wallet[] };
  products: { key: string; value: Product[] };
};

let _db: IDBPDatabase<MendakoDB> | null = null;

async function getDB(): Promise<IDBPDatabase<MendakoDB>> {
  if (_db) return _db;

  _db = await openDB<MendakoDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("event_state")) {
        db.createObjectStore("event_state");
      }
      if (!db.objectStoreNames.contains("wallets")) {
        db.createObjectStore("wallets");
      }
      if (!db.objectStoreNames.contains("products")) {
        db.createObjectStore("products");
      }
    },
  });

  return _db;
}

/**
 * IDB に保存できない値（Promise / function / symbol / 循環参照など）を除去して
 * "structured clone" エラーを避けるためのサニタイズ。
 *
 * - JSON.stringify が undefined を返すケースをガード
 * - thenable(Promiseっぽいもの) を弾く
 */
function sanitizeForIDB<T>(value: T): T | null {
  try {
    const json = JSON.stringify(value, (_k, v) => {
      if (typeof v === "function") return undefined;
      if (typeof v === "symbol") return undefined;

      // Promise / thenable を弾く（IDBのcloneで落ちやすい）
      if (v && typeof v === "object" && typeof (v as any).then === "function") {
        return undefined;
      }

      return v;
    });

    // JSON.stringify が undefined を返す場合がある（ルートがundefined等）
    if (json === undefined) return null;

    return JSON.parse(json) as T;
  } catch {
    // 循環参照などで stringify が落ちたら保存しない
    return null;
  }
}

// -------- event_state --------

export async function idbLoadState(): Promise<EventState | null> {
  const db = await getDB();
  return (await db.get("event_state", KEY)) ?? null;
}

export async function idbSaveState(state: EventState | undefined | null): Promise<void> {
  if (!state) return;

  const safe = sanitizeForIDB(state);
  if (!safe) return;

  const db = await getDB();
  await db.put("event_state", safe, KEY);
}

// -------- wallets --------

export async function idbLoadWallets(): Promise<Wallet[] | null> {
  const db = await getDB();
  return (await db.get("wallets", KEY)) ?? null;
}

export async function idbSaveWallets(wallets: Wallet[] | undefined | null): Promise<void> {
  if (!wallets) return;

  const safe = sanitizeForIDB(wallets);
  if (!safe) return;

  const db = await getDB();
  await db.put("wallets", safe, KEY);
}

// -------- products --------

export async function idbLoadProducts(): Promise<Product[] | null> {
  const db = await getDB();
  return (await db.get("products", KEY)) ?? null;
}

export async function idbSaveProducts(products: Product[] | undefined | null): Promise<void> {
  if (!products) return;

  const safe = sanitizeForIDB(products);
  if (!safe) return;

  const db = await getDB();
  await db.put("products", safe, KEY);
}