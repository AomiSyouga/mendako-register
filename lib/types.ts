export type PaymentMethod = "cash" | "cashless";

export type Wallet = {
  id: string;
  name: string;
};

export type Sale = {
  id: string;
  at: number;
  amount: number;
  payment: PaymentMethod;
  walletId: string;
  cashReceived?: number;
  productId?: string;
};

export type Gift = {
  id: string;
  at: number;
  fromName: string;
  content: string;
  imageDataUrl?: string;
  thanked: boolean;
};

// ✅ 追加：締めたイベントの保管型
export type ArchivedEvent = {
  id: string;
  eventName: string;
  eventDate: string;
  startAt: number | null;
  endAt: number | null;
  cashFloatByWallet: Record<string, number>;
  sales: Sale[];
  gifts: Gift[];
};

export type EventState = {
  eventName: string;
  eventDate: string;
  startAt: number | null;
  endAt: number | null;
  cashFloat: number;
  cashFloatByWallet: Record<string, number>;
  sales: Sale[];      // ← 現在進行中イベントの売上のみ
  gifts: Gift[];      // ← 現在進行中イベントのギフトのみ
  archivedEvents: ArchivedEvent[];  // ✅ 追加：過去イベント一覧
};

export type ProductTag = 
  | "ポーチ" 
  | "かばん" 
  | "アート" 
  | "家具" 
  | "ボックス" 
  | "アクリルキーホルダー" 
  | "メガネケース"
  | "カードケース"
  | "財布";

export type Product = {
  id: string;
  name: string;
  price: number;
  walletId: string;
  tags?: ProductTag[];
  imageDataUrl?: string;
};

export const DEFAULT_WALLETS: Wallet[] = [
  { id: "wallet_1", name: "自分" },
  { id: "wallet_2", name: "ユーザー" },
  { id: "wallet_3", name: "委託" },
];