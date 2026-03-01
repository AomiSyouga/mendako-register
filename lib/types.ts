export type PaymentMethod = "cash" | "cashless";

export type Wallet = {
  id: string;
  name: string;
};



// 既存のSaleの下に追加
export type CartDiscount = {
  type: "amount" | "percent";
  value: number;
  reason?: string;
};

export type LineDiscount = {
  type: "amount" | "percent";
  value: number;
};

// Saleに追加フィールド（optional なので既存データ壊れない）
export type Sale = {
  id: string;
  at: number;
  amount: number;
  payment: PaymentMethod;
  walletId: string;
  cashReceived?: number;
  productId?: string;
  // ↓ 追加
  sessionId?: string;        // 同じ会計をグループ化するID
  originalAmount?: number;   // 値引き前の金額
  lineDiscount?: LineDiscount;
  cartDiscount?: CartDiscount; // 会計値引きはセッションの代表に付ける
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