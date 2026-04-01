"use client";

import { useMemo, useState, useEffect, type ChangeEvent, type CSSProperties } from "react";
import { type PaymentMethod, type Sale, type Wallet, type Product, type ProductTag, type Gift, type LineDiscount, type CartDiscount, type EventState } from "@/lib/types";
import { archiveCurrentEvent } from "@/lib/storage";
import { idbSaveState } from "@/lib/db";

function yen(n: number) {
  return Math.round(n).toLocaleString("ja-JP");
}
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function toNumberSafe(v: string): number {
  const n = Number((v ?? "").toString().replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

type Props = {
  wallets: Wallet[];
  products: Product[];
  state: EventState;
  setState: (updater: EventState | ((prev: EventState) => EventState)) => void;
  ready: boolean;
  pushSync: () => Promise<void>;
};

const TAGS_KEY = "mendako_v0_tags";
const DEFAULT_TAGS = ["ポーチ", "かばん", "アート", "家具", "ボックス", "アクリルキーホルダー", "メガネケース", "カードケース", "財布"];
function loadTags(): string[] {
  if (typeof window === "undefined") return DEFAULT_TAGS;
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_TAGS;
  } catch { return DEFAULT_TAGS; }
}

export function Register({ wallets, products, state, setState, ready, pushSync }: Props) {
  const [allTags] = useState<string[]>(loadTags);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [walletId, setWalletId] = useState<string>(wallets[0]?.id ?? "");
  const [cashReceived, setCashReceived] = useState<string>("");
  const [cart, setCart] = useState<{ product: Product; qty: number; lineDiscount?: LineDiscount }[]>([]);
  const [cartDiscount, setCartDiscount] = useState<CartDiscount | null>(null);
  const [showDiscountSheet, setShowDiscountSheet] = useState(false);
  const [filterTag, setFilterTag] = useState<ProductTag | "all">("all");
  const [gridSize, setGridSize] = useState<"small" | "medium" | "large">("small");
  const [manualAmount, setManualAmount] = useState<string>("");

  const [showEvent, setShowEvent] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [settleSnapshot, setSettleSnapshot] = useState<null | {
    total: number;
    cashTotal: number;
    cashlessTotal: number;
    byWallet: Record<string, { total: number; cash: number }>;
    cashFloatByWallet: Record<string, number>;
  }>(null);

  const [actualCash, setActualCash] = useState<Record<string, string>>({});

  const [showGift, setShowGift] = useState(false);
  const [giftForm, setGiftForm] = useState({ fromName: "", content: "", imageDataUrl: "" });

  useEffect(() => {
    if (!walletId && wallets[0]?.id) setWalletId(wallets[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets?.length]);

 // ===== 計算系 =====
const cartTotal = useMemo(() => cart.reduce((a, c) => a + c.product.price * c.qty, 0), [cart]);
const manual = toNumberSafe(manualAmount);

// 行値引き合計
const lineDiscountTotal = useMemo(() => cart.reduce((s, c) => {
  if (!c.lineDiscount) return s;
  const base = c.product.price * c.qty;
  return s + (c.lineDiscount.type === "amount"
    ? c.lineDiscount.value
    : Math.round(base * c.lineDiscount.value / 100));
}, 0), [cart]);

const afterLineDiscount = cartTotal - lineDiscountTotal;

// 会計値引き額
const cartDiscountAmount = useMemo(() => {
  if (!cartDiscount) return 0;
  return cartDiscount.type === "amount"
    ? cartDiscount.value
    : Math.round(afterLineDiscount * cartDiscount.value / 100);
}, [cartDiscount, afterLineDiscount]);

const finalAmount = cart.length > 0 ? Math.max(0, afterLineDiscount - cartDiscountAmount) : manual;

const computedChange = useMemo(() => {
  if (payment !== "cash") return null;
  const received = toNumberSafe(cashReceived);
  if (!received) return null;
  return Math.round(received - finalAmount);
}, [payment, cashReceived, finalAmount]);

const cartByWallet = useMemo(() => {
  const byWallet: Record<string, number> = {};
  for (const c of cart) {
    const wid = c.product.walletId;
    byWallet[wid] = (byWallet[wid] ?? 0) + c.product.price * c.qty;
  }
  return byWallet;
}, [cart]);

  const autoWalletId = useMemo(() => {
    if (cart.length === 0) return walletId;
    const byWallet: Record<string, number> = {};
    for (const c of cart) {
      byWallet[c.product.walletId] = (byWallet[c.product.walletId] ?? 0) + c.product.price * c.qty;
    }
    let bestId = walletId;
    let bestAmount = -1;
    for (const w of wallets) {
      const amt = byWallet[w.id] ?? 0;
      if (amt > bestAmount) {
        bestAmount = amt;
        bestId = w.id;
      }
    }
    return bestId;
  }, [cart, walletId, wallets]);

  const [overrideWalletId, setOverrideWalletId] = useState<string | null>(null);
  const activeWalletId = cart.length > 0 ? (overrideWalletId ?? autoWalletId) : walletId;

  const totals = useMemo(() => {
    const sales = state?.sales ?? [];

    // 値引きレコード（cartDiscountがある、かつamountがマイナス）を分離
    const normalSales = sales.filter((s) => (s?.amount ?? 0) >= 0);
    const discountSales = sales.filter((s) => (s?.amount ?? 0) < 0);

    const discountTotal = discountSales.reduce((a, s) => a + (s?.amount ?? 0), 0);
    const total = normalSales.reduce((a, s) => a + (s?.amount ?? 0), 0) + discountTotal;
    const cashTotal = normalSales
      .filter((s) => s?.payment === "cash")
      .reduce((a, s) => a + (s?.amount ?? 0), 0)
      + discountSales.filter((s) => s?.payment === "cash")
        .reduce((a, s) => a + (s?.amount ?? 0), 0);
    const cashlessTotal = total - cashTotal;

    const byWallet: Record<string, { total: number; cash: number }> = {};
    for (const w of wallets ?? []) byWallet[w.id] = { total: 0, cash: 0 };

    for (const s of sales) {
      const wid = s?.walletId;
      if (!wid) continue;
      if (!byWallet[wid]) byWallet[wid] = { total: 0, cash: 0 };
      byWallet[wid].total += s.amount ?? 0;
      if (s.payment === "cash") byWallet[wid].cash += s.amount ?? 0;
    }

    return { total, cashTotal, cashlessTotal, byWallet };
  }, [state, wallets]);

  // ===== 操作系 =====
  function addToCart(p: Product) {
    setManualAmount("");
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.product.id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, { product: p, qty: 1 }];
    });
    setOverrideWalletId(null);
  }

  function removeFromCart(id: string) {
    setCart((c) => c.filter((x) => x.product.id !== id));
    setOverrideWalletId(null);
  }

  function addSale() {
  if (!finalAmount || finalAmount <= 0) return;
  const received = toNumberSafe(cashReceived);
  const baseCommon = payment === "cash" && received ? { cashReceived: received } : {};
  const sessionId = uid();

  if (cart.length > 0) {
    // 各商品は元値のまま保存
    const newSales: Sale[] = cart.map((c) => ({
      id: uid(),
      at: Date.now(),
      amount: c.product.price * c.qty,
      originalAmount: c.product.price * c.qty,
      payment,
      walletId: c.product.walletId,
      productId: c.product.id,
      sessionId,
      lineDiscount: c.lineDiscount,
      ...baseCommon,
    }));

    // 値引きは別レコードとして追加
    const discountSales: Sale[] = cartDiscount && cartDiscountAmount > 0 ? [{
      id: uid(),
      at: Date.now(),
      amount: -cartDiscountAmount,
      payment,
      walletId: cart[0].product.walletId,
      sessionId,
      cartDiscount: cartDiscount,
      ...baseCommon,
    }] : [];

    setState((s) => ({ ...s, sales: [...newSales, ...discountSales, ...(s.sales ?? [])] }));
    setCart([]);
    setCartDiscount(null);
    setOverrideWalletId(null);
  } else {
    const sale: Sale = {
      id: uid(),
      at: Date.now(),
      amount: Math.round(finalAmount),
      payment,
      walletId: activeWalletId,
      sessionId,
      ...baseCommon,
    };
    setState((s) => ({ ...s, sales: [sale, ...(s.sales ?? [])] }));
    setManualAmount("");
  }

  setCashReceived("");
}

  function setWalletFloat(wid: string, v: string) {
    const n = toNumberSafe(v);
    setState((s) => ({
      ...s,
      cashFloatByWallet: { ...(s.cashFloatByWallet ?? {}), [wid]: Math.max(0, Math.round(n)) },
    }));
  }

  function handleGiftImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      setGiftForm((f) => ({ ...f, imageDataUrl: canvas.toDataURL("image/jpeg", 0.6) }));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function addGift() {
    if (!giftForm.fromName && !giftForm.content) return;
    const gift: Gift = {
      id: uid(),
      at: Date.now(),
      fromName: giftForm.fromName,
      content: giftForm.content,
      imageDataUrl: giftForm.imageDataUrl || undefined,
      thanked: false,
    };
    setState((s) => ({ ...s, gifts: [gift, ...(s.gifts ?? [])] }));
    setGiftForm({ fromName: "", content: "", imageDataUrl: "" });
    setShowGift(false);
  }

  function toggleThanked(id: string) {
    setState((s) => ({
      ...s,
      gifts: (s.gifts ?? []).map((g) => (g.id === id ? { ...g, thanked: !g.thanked } : g)),
    }));
  }

  function removeGift(id: string) {
    setState((s) => ({ ...s, gifts: (s.gifts ?? []).filter((g) => g.id !== id) }));
  }

// ===== しめる =====
async function handleClose() {
  // 1. スナップショット
  setSettleSnapshot({ ...totals, cashFloatByWallet: state.cashFloatByWallet });
  setShowSettle(true);

  // 2. リセット済みstateを計算
  const nextState = archiveCurrentEvent(state);

  // 3. IDBに確実に保存（awaitで完了を待つ）
  await idbSaveState(nextState).catch(() => {});

  // 4. Reactのstateを更新（IDB保存後）
  setState(nextState);

  // 5. UIリセット
  setCart([]);
  setOverrideWalletId(null);
  setCashReceived("");
  setManualAmount("");
  setPayment("cash");

  // 6. IDB保存済みなのでそのままpush
  await pushSync().catch(() => {});
}

  // ===== はじめる =====
  function handleOpen() {
    setCart([]);
    setOverrideWalletId(null);
    setCashReceived("");
    setManualAmount("");
    setPayment("cash");

    setState((prev) => ({
      ...prev,
      startAt: Date.now(),
      endAt: null,
      eventDate: prev.eventDate || new Date().toISOString().slice(0, 10),
    }));
  }

  // ===== UI計算 =====
  const filteredProducts =
    filterTag === "all" ? products : products.filter((p) => p.tags?.includes(filterTag));

  const gridCols =
    gridSize === "small"
      ? "repeat(4, 1fr)"
      : gridSize === "medium"
      ? "repeat(3, 1fr)"
      : "repeat(2, 1fr)";

  const inputStyle: CSSProperties = {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(220,160,220,0.35)",
    borderRadius: 12,
    color: "white",
    padding: "12px 16px",
    width: "100%",
    fontSize: 17,
    fontFamily: "inherit",
    outline: "none",
  };

  const labelStyle: CSSProperties = {
    fontSize: 13,
    color: "rgba(220,180,220,0.8)",
    marginBottom: 5,
    display: "block",
  };

  const cardStyle: CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(220,160,220,0.18)",
    borderRadius: 18,
    padding: "16px",
    marginBottom: 12,
  };

  if (!ready) return <div style={{ padding: 24, fontSize: 18 }}>読み込み中…</div>;

  return (
    <div style={{ padding: "4px 0" }}>
      {/* 精算モーダル */}
      {showSettle && settleSnapshot && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #0d0820, #1a0f3a)",
              border: "1px solid rgba(220,160,220,0.3)",
              borderRadius: 24,
              padding: "28px 24px",
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f0c0f0", marginBottom: 6 }}>
              🌊 精算
            </div>
            <div style={{ fontSize: 13, color: "rgba(200,160,200,0.7)", marginBottom: 20 }}>
              {state.eventName} ／ {state.eventDate}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f8d8f8", marginBottom: 16 }}>
              合計売上：{yen(settleSnapshot.total)}円
            </div>

            {wallets.map((w) => {
              const wt = settleSnapshot.byWallet[w.id] ?? { total: 0, cash: 0 };
              const float = (settleSnapshot.cashFloatByWallet ?? state.cashFloatByWallet ?? {})[w.id] ?? 0;
              const theoretical = float + wt.cash;
              const actual = toNumberSafe(actualCash[w.id] ?? "");
              const diff = actual - theoretical;

              return (
                <div
                  key={w.id}
                  style={{
                    marginBottom: 16,
                    padding: "14px 16px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(220,160,220,0.15)",
                    borderRadius: 16,
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#f0c0f0", marginBottom: 10 }}>
                    {w.name}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(200,160,200,0.8)", marginBottom: 8 }}>
                    売上：{yen(wt.total)}円 ／ 現金売上：{yen(wt.cash)}円
                    <br />
                    初期釣り銭：{yen(float)}円 → 理論現金：{yen(theoretical)}円
                  </div>

                  <label style={labelStyle}>実際に数えた現金（円）</label>
                  <input
                    style={{ ...inputStyle, fontSize: 16, padding: "10px 14px" }}
                    inputMode="numeric"
                    placeholder={`例：${theoretical}`}
                    value={actualCash[w.id] ?? ""}
                    onChange={(e) => setActualCash((a) => ({ ...a, [w.id]: e.target.value }))}
                  />

                  {(actualCash[w.id] ?? "").trim() !== "" && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 16,
                        fontWeight: 700,
                        color: diff === 0 ? "#b0f0b0" : diff > 0 ? "#f0e0b0" : "#ff8080",
                      }}
                    >
                      {diff === 0
                        ? "✅ ぴったり！"
                        : diff > 0
                        ? `📈 ${yen(diff)}円（多い）`
                        : `📉 ${yen(Math.abs(diff))}円（少ない）`}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => setShowSettle(false)}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                background: "linear-gradient(135deg, rgba(180,60,180,0.6), rgba(100,60,180,0.6))",
                border: "1px solid rgba(220,120,220,0.4)",
                color: "white",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              精算完了 🐙
            </button>
          </div>
        </div>
      )}

{/* 値引きBottomSheet */}
{showDiscountSheet && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
    }}
    onClick={() => setShowDiscountSheet(false)}
  >
    <div
      style={{
        background: "linear-gradient(135deg, #0d0820, #1a0f3a)",
        border: "1px solid rgba(220,160,220,0.3)",
        borderRadius: "24px 24px 0 0",
        padding: "28px 24px",
        width: "100%",
        maxWidth: 480,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f0c0f0", marginBottom: 16 }}>
        🏷 値引き
      </div>

      {/* ワンタップボタン */}
<div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
  {[
    { label: "応援 -100円", type: "amount" as const, value: 100, reason: "応援" },
    { label: "常連 -200円", type: "amount" as const, value: 200, reason: "常連" },
    { label: "端数まけ -500円", type: "amount" as const, value: 500, reason: "端数まけ" },
  ].map((preset) => (
    <button
      key={preset.label}
      onClick={() => {
        setCartDiscount({ type: preset.type, value: preset.value, reason: preset.reason });
        setShowDiscountSheet(false);
      }}
      style={{
        padding: "10px 16px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 700,
        background: "rgba(220,100,220,0.2)",
        border: "1px solid rgba(220,120,220,0.4)",
        color: "#f0c0f0",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {preset.label}
    </button>
  ))}
</div>

      {/* 手入力 */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>金額を手入力（円）</label>
        <input
          style={{ ...inputStyle, fontSize: 16, padding: "10px 14px" }}
          inputMode="numeric"
          placeholder="例：300"
          id="discountInput"
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>理由（任意）</label>
        <input
          style={{ ...inputStyle, fontSize: 14, padding: "10px 14px" }}
          placeholder="例：常連さん"
          id="discountReason"
        />
      </div>

      <button
        onClick={() => {
          const val = toNumberSafe((document.getElementById("discountInput") as HTMLInputElement)?.value ?? "");
          const reason = (document.getElementById("discountReason") as HTMLInputElement)?.value ?? "";
          if (val > 0) {
            setCartDiscount({ type: "amount", value: val, reason: reason || undefined });
          }
          setShowDiscountSheet(false);
        }}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 700,
          background: "linear-gradient(135deg, rgba(180,60,180,0.6), rgba(100,60,180,0.6))",
          border: "1px solid rgba(220,120,220,0.4)",
          color: "white",
          cursor: "pointer",
          fontFamily: "inherit",
          marginBottom: 8,
        }}
      >
        適用する
      </button>

      <button
        onClick={() => {
          setCartDiscount(null);
          setShowDiscountSheet(false);
        }}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: 10,
          fontSize: 13,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,100,100,0.3)",
          color: "#ff9090",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        値引きをクリア
      </button>
    </div>
  </div>
)}

      {/* 差し入れモーダル */}
      {showGift && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #0d0820, #1a0f3a)",
              border: "1px solid rgba(220,160,220,0.3)",
              borderRadius: 24,
              padding: "28px 24px",
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f0c0f0", marginBottom: 20 }}>
              🎁 差し入れメモ
            </div>

            <div
              style={{
                marginBottom: 20,
                padding: "16px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 16,
                border: "1px solid rgba(220,160,220,0.15)",
              }}
            >
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>名前</label>
                <input
                  style={{ ...inputStyle, fontSize: 14, padding: "10px 12px" }}
                  placeholder="例：田中さん"
                  value={giftForm.fromName}
                  onChange={(e) => setGiftForm((f) => ({ ...f, fromName: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>内容</label>
                <input
                  style={{ ...inputStyle, fontSize: 14, padding: "10px 12px" }}
                  placeholder="例：お菓子・飲み物"
                  value={giftForm.content}
                  onChange={(e) => setGiftForm((f) => ({ ...f, content: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>写真</label>
                {giftForm.imageDataUrl ? (
                  <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
                    <img
                      src={giftForm.imageDataUrl}
                      alt=""
                      style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8 }}
                    />
                    <button
                      onClick={() => setGiftForm((f) => ({ ...f, imageDataUrl: "" }))}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        background: "rgba(0,0,0,0.6)",
                        border: "1px solid rgba(255,100,100,0.5)",
                        color: "#ff9090",
                        borderRadius: 6,
                        padding: "2px 8px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: "inherit",
                      }}
                    >
                      ✕ 削除
                    </button>
                  </div>
                ) : (
                  <label
                    style={{
                      display: "inline-block",
                      padding: "10px 16px",
                      borderRadius: 10,
                      fontSize: 13,
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(220,160,220,0.3)",
                      color: "rgba(220,180,220,0.9)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    📷 写真を選ぶ
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: "none" }}
                      onChange={handleGiftImage}
                    />
                  </label>
                )}
              </div>

              <button
                onClick={addGift}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  background: "linear-gradient(135deg, rgba(180,60,180,0.6), rgba(100,60,180,0.6))",
                  border: "1px solid rgba(220,120,220,0.4)",
                  color: "white",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                記録する 🎁
              </button>
            </div>

            {(state.gifts ?? []).length > 0 && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f0c0f0", marginBottom: 10 }}>
                  一覧（{(state.gifts ?? []).length}件）
                </div>

                {(state.gifts ?? []).map((g) => (
                  <div
                    key={g.id}
                    style={{
                      marginBottom: 10,
                      padding: "12px 14px",
                      background: g.thanked ? "rgba(100,200,100,0.06)" : "rgba(255,255,255,0.04)",
                      border: g.thanked
                        ? "1px solid rgba(100,200,100,0.2)"
                        : "1px solid rgba(220,160,220,0.15)",
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#f0c0f0" }}>
                          {g.fromName || "名前なし"}
                        </div>
                        <div style={{ fontSize: 13, color: "rgba(200,160,200,0.8)", marginTop: 2 }}>
                          {g.content}
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(180,140,180,0.6)", marginTop: 2 }}>
                          {new Date(g.at).toLocaleTimeString()}
                        </div>
                        {g.imageDataUrl && (
                          <img
                            src={g.imageDataUrl}
                            alt=""
                            style={{ marginTop: 6, width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 6 }}
                          />
                        )}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 8 }}>
                        <button
                          onClick={() => toggleThanked(g.id)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            background: g.thanked ? "rgba(100,200,100,0.3)" : "rgba(255,255,255,0.06)",
                            border: g.thanked
                              ? "1px solid rgba(100,200,100,0.5)"
                              : "1px solid rgba(220,160,220,0.2)",
                            color: g.thanked ? "#90f090" : "white",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g.thanked ? "✅ お礼済" : "お礼する"}
                        </button>

                        <button
                          onClick={() => removeGift(g.id)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,100,100,0.3)",
                            color: "#ff9090",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowGift(false)}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "12px",
                borderRadius: 10,
                fontSize: 14,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(220,160,220,0.25)",
                color: "white",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* イベント */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#f0c0f0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {state.eventName || "イベント名未設定"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(200,160,200,0.7)", marginTop: 2 }}>
              📅 {state.eventDate || "日付未設定"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
            <button
              onClick={() => setShowEvent((v) => !v)}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 13,
                background: showEvent ? "rgba(220,100,220,0.35)" : "rgba(255,255,255,0.08)",
                border: "1px solid rgba(220,160,220,0.3)",
                color: "white",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              編集 {showEvent ? "▲" : "▼"}
            </button>

            {state.startAt && !state.endAt ? (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#ff80c0",
                  border: "1px solid rgba(255,100,180,0.5)",
                  background: "rgba(255,80,160,0.15)",
                }}
              >
                🔴 記録中
              </div>
            ) : (
              <button
                type="button"
                onClick={handleOpen}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  background: "rgba(220,100,220,0.35)",
                  border: "1px solid rgba(220,120,220,0.5)",
                  color: "white",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                はじめる
              </button>
            )}

            <button
              type="button"
              onClick={handleClose}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 13,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(220,160,220,0.3)",
                color: "white",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              しめる
            </button>
          </div>
        </div>

        {showEvent && (
          <div style={{ marginTop: 14, borderTop: "1px solid rgba(220,160,220,0.15)", paddingTop: 14 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>イベント名</label>
              <input
                style={inputStyle}
                placeholder="例：春のマルシェ2026"
                value={state.eventName ?? ""}
                onChange={(e) => setState((s) => ({ ...s, eventName: e.target.value }))}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>日付</label>
              <input
                style={{ ...inputStyle, colorScheme: "dark" }}
                type="date"
                value={state.eventDate ?? ""}
                onChange={(e) => setState((s) => ({ ...s, eventDate: e.target.value }))}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ ...labelStyle, marginBottom: 10 }}>釣り銭（ウォレット別）</label>

              {wallets.map((w) => {
                const sales = state.sales ?? [];
                const cashSales = sales
                  .filter((s) => s.walletId === w.id && s.payment === "cash")
                  .reduce((a, s) => a + (s.amount ?? 0), 0);
                const float = (state.cashFloatByWallet ?? {})[w.id] ?? 0;
                const theoretical = float + cashSales;

                return (
                  <div
                    key={w.id}
                    style={{
                      marginBottom: 10,
                      padding: "10px 12px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(220,160,220,0.12)",
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f0c0f0", marginBottom: 6 }}>
                      {w.name}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        style={{ ...inputStyle, fontSize: 14, padding: "8px 12px" }}
                        inputMode="numeric"
                        placeholder="初期釣り銭"
                        value={String(float)}
                        onChange={(e) => setWalletFloat(w.id, e.target.value)}
                      />
                      <div style={{ fontSize: 12, color: "rgba(200,160,200,0.7)", whiteSpace: "nowrap" }}>
                        理論残高：<span style={{ color: "white", fontWeight: 700 }}>{yen(theoretical)}円</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 13, color: "rgba(200,160,200,0.7)" }}>
              開始: {state.startAt ? new Date(state.startAt).toLocaleString() : "未開始"} ／ 終了:{" "}
              {state.endAt ? new Date(state.endAt).toLocaleString() : "未締め"}
            </div>
          </div>
        )}
      </div>

      {/* メイン：商品（左大） + 右（フィルター＋会計） */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: 12,
          marginBottom: 12,
          alignItems: "start",
        }}
      >
        {/* 左：商品グリッド */}
        <div style={{ ...cardStyle, marginBottom: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f0c0f0", marginBottom: 8 }}>商品</div>

          <div style={{ maxHeight: 520, overflowY: "auto", paddingRight: 2 }}>
            {filteredProducts.length === 0 ? (
              <div style={{ fontSize: 13, color: "rgba(200,160,200,0.5)", textAlign: "center", padding: "20px 0" }}>
                商品なし
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8 }}>
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    style={{
                      padding: "6px",
                      borderRadius: 10,
                      fontSize: 11,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(220,160,220,0.2)",
                      color: "white",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {p.imageDataUrl ? (
                      <img
                        src={p.imageDataUrl}
                        alt={p.name}
                        style={{
                          width: "100%",
                          aspectRatio: "1/1",
                          objectFit: "cover",
                          borderRadius: 6,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          aspectRatio: "1/1",
                          borderRadius: 6,
                          background: "rgba(220,160,220,0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 6,
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            fontSize: gridSize === "small" ? 13 : gridSize === "medium" ? 16 : 20,
                            fontWeight: 800,
                            textAlign: "center",
                            lineHeight: 1.3,
                            color: "rgba(240,200,240,0.9)",
                            wordBreak: "break-all",
                            display: "-webkit-box",
                            WebkitLineClamp: 4,
                            WebkitBoxOrient: "vertical" as const,
                            overflow: "hidden",
                          }}
                        >
                          {p.name}
                        </span>
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textAlign: "center",
                        lineHeight: 1.3,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                      }}
                    >
                      {p.name}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(220,180,220,0.8)" }}>{yen(p.price)}円</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 4 }}>手入力（円）</label>
            <input
              style={{ ...inputStyle, fontSize: 14, padding: "10px 12px" }}
              inputMode="numeric"
              placeholder="金額を直接入力"
              value={manualAmount}
              onChange={(e) => {
                setManualAmount(e.target.value);
                setCart([]);
                setOverrideWalletId(null);
              }}
            />
          </div>
        </div>

        {/* 右：フィルター＋サイズ＋会計 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 商品フィルター */}
          <div style={{ ...cardStyle, marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f0c0f0" }}>商品フィルター</div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["small", "medium", "large"] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setGridSize(size)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 8,
                      fontSize: 11,
                      background: gridSize === size ? "rgba(220,100,220,0.4)" : "rgba(255,255,255,0.06)",
                      border:
                        gridSize === size ? "1px solid rgba(220,120,220,0.6)" : "1px solid rgba(220,160,220,0.15)",
                      color: "white",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {size === "small" ? "小" : size === "medium" ? "中" : "大"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(["all", ...allTags] as (ProductTag | "all")[]).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(tag)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 12,
                    fontSize: 11,
                    background: filterTag === tag ? "rgba(220,100,220,0.4)" : "rgba(255,255,255,0.06)",
                    border:
                      filterTag === tag ? "1px solid rgba(220,120,220,0.6)" : "1px solid rgba(220,160,220,0.15)",
                    color: "white",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {tag === "all" ? "全部" : tag}
                </button>
              ))}
            </div>
          </div>

          {/* 会計 */}
          <div style={{ ...cardStyle, marginBottom: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f0c0f0" }}>会計</div>

            {cart.length > 0 && (
              <div>
                {cart.map((c) => (
                  <div
                    key={c.product.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "5px 0",
                      borderBottom: "1px solid rgba(220,160,220,0.1)",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.product.name}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(200,160,200,0.7)" }}>
                        {wallets.find((w) => w.id === c.product.walletId)?.name ?? c.product.walletId} ／ ×{c.qty} ={" "}
                        {yen(c.product.price * c.qty)}円
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(c.product.id)}
                      style={{
                        padding: "2px 6px",
                        borderRadius: 6,
                        fontSize: 11,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,100,100,0.3)",
                        color: "#ff9090",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {Object.keys(cartByWallet).length > 1 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "rgba(200,160,200,0.6)" }}>
                    {wallets
                      .filter((w) => cartByWallet[w.id])
                      .map((w) => (
                        <span key={w.id} style={{ marginRight: 8 }}>
                          {w.name}:{yen(cartByWallet[w.id])}円
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 24, fontWeight: 700, color: "#f8d8f8", textShadow: "0 0 15px rgba(220,100,220,0.4)" }}>
           {/* 値引きボタン */}
{cart.length > 0 && (
  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
    <button
      onClick={() => setShowDiscountSheet(true)}
      style={{
        padding: "4px 12px",
        borderRadius: 8,
        fontSize: 12,
        background: cartDiscount ? "rgba(220,100,220,0.4)" : "rgba(255,255,255,0.06)",
        border: cartDiscount ? "1px solid rgba(220,120,220,0.8)" : "1px solid rgba(220,160,220,0.2)",
        color: cartDiscount ? "#f0c0f0" : "rgba(200,160,200,0.7)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      🏷 値引き{cartDiscount ? "あり" : ""}
    </button>
  </div>
)}

{/* 値引きありのとき小計を小さく表示、なければ非表示 */}
{cartDiscount && (
  <div style={{ fontSize: 15, color: "rgba(200,160,200,0.5)", textDecoration: "line-through", marginBottom: 2 }}>
    {yen(afterLineDiscount)}円
  </div>
)}

{/* 値引き額（値引きありのときだけ） */}
{cartDiscount && (
  <div style={{ fontSize: 13, color: "rgba(220,180,100,0.9)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
    値引き -{yen(cartDiscountAmount)}円
    {cartDiscount.reason && `（${cartDiscount.reason}）`}
    <button
      onClick={() => setCartDiscount(null)}
      style={{
        fontSize: 11,
        background: "none",
        border: "none",
        color: "rgba(255,120,120,0.8)",
        cursor: "pointer",
        fontFamily: "inherit",
        padding: 0,
      }}
    >
      ✕
    </button>
  </div>
)}

{/* メイン金額（常に1つだけ） */}
<div style={{ fontSize: 24, fontWeight: 700, color: "#f8d8f8", textShadow: "0 0 15px rgba(220,100,220,0.4)" }}>
  {yen(finalAmount)}円
</div>

            <div>
              <label style={labelStyle}>支払い</label>
              <div style={{ display: "flex", gap: 6 }}>
                {(["cash", "cashless"] as PaymentMethod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPayment(p)}
                    style={{
                      flex: 1,
                      padding: "10px 4px",
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 700,
                      background: payment === p ? "rgba(220,100,220,0.5)" : "rgba(255,255,255,0.06)",
                      border: payment === p ? "2px solid rgba(220,120,220,0.8)" : "1px solid rgba(220,160,220,0.2)",
                      color: "white",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      boxShadow: payment === p ? "0 0 12px rgba(220,100,220,0.3)" : "none",
                    }}
                  >
                    {p === "cash" ? "💴 現金" : "📱 キャッシュレス"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>
                受取ウォレット
                {cart.length > 0 && overrideWalletId === null && (
                  <span style={{ fontSize: 11, color: "rgba(220,180,100,0.8)", marginLeft: 6 }}>（自動）</span>
                )}
              </label>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {wallets.map((w) => {
                  const isActive = activeWalletId === w.id;
                  const amount = cartByWallet[w.id];

                  return (
                    <button
                      key={w.id}
                      onClick={() => {
                        if (cart.length > 0) setOverrideWalletId(w.id);
                        else setWalletId(w.id);
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 4px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: isActive ? 700 : 400,
                        background: isActive ? "rgba(220,100,220,0.5)" : "rgba(255,255,255,0.06)",
                        border: isActive ? "2px solid rgba(220,120,220,0.8)" : "1px solid rgba(220,160,220,0.2)",
                        color: "white",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        boxShadow: isActive ? "0 0 12px rgba(220,100,220,0.3)" : "none",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <span>{w.name}</span>
                      {amount ? <span style={{ fontSize: 10, color: "rgba(220,180,220,0.8)" }}>{yen(amount)}円</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {payment === "cash" && (
              <div>
                <label style={labelStyle}>受取額</label>
                <input
                  style={{ ...inputStyle, fontSize: 14, padding: "10px 12px" }}
                  inputMode="numeric"
                  placeholder="例：2000"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                />

                {computedChange !== null && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 15,
                      fontWeight: 700,
                      color: computedChange < 0 ? "#ff8080" : "#b0f0b0",
                    }}
                  >
                    お釣り：{yen(computedChange)}円
                    {computedChange < 0 && <span style={{ fontSize: 11, marginLeft: 4 }}>（足りない）</span>}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={addSale}
              disabled={!finalAmount}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                background: "linear-gradient(135deg, rgba(180,60,180,0.6), rgba(100,60,180,0.6))",
                border: "1px solid rgba(220,120,220,0.4)",
                color: "white",
                cursor: "pointer",
                fontFamily: "inherit",
                opacity: !finalAmount ? 0.3 : 1,
                boxShadow: "0 4px 20px rgba(160,40,160,0.35)",
              }}
            >
              記録する
            </button>

            <button
              onClick={() => setShowGift(true)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 10,
                fontSize: 13,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(220,160,220,0.25)",
                color: "rgba(220,180,220,0.8)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              🎁 差し入れメモ
              {(state.gifts ?? []).filter((g) => !g.thanked).length > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    background: "rgba(220,100,100,0.6)",
                    borderRadius: 10,
                    padding: "1px 6px",
                    fontSize: 11,
                    color: "white",
                  }}
                >
                  {(state.gifts ?? []).filter((g) => !g.thanked).length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* サマリー */}
      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f0c0f0", marginBottom: 12 }}>サマリー</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: "#f8d8f8", textShadow: "0 0 15px rgba(220,100,220,0.4)" }}>
          合計：{yen(totals.total)}円
        </div>
        <div style={{ fontSize: 14, color: "rgba(210,170,210,0.85)", marginBottom: 12 }}>
          現金：{yen(totals.cashTotal)}円 ／ キャッシュレス：{yen(totals.cashlessTotal)}円
        </div>

        {wallets.map((w) => {
          const wt = totals.byWallet[w.id] ?? { total: 0, cash: 0 };
          const float = (state.cashFloatByWallet ?? {})[w.id] ?? 0;
          const theoretical = float + wt.cash;

          return (
            <div
              key={w.id}
              style={{
                marginBottom: 8,
                padding: "10px 12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(220,160,220,0.1)",
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f0c0f0", marginBottom: 4 }}>{w.name}</div>
              <div style={{ fontSize: 13, color: "rgba(200,160,200,0.8)" }}>
                売上：{yen(wt.total)}円 ／ 現金：{yen(wt.cash)}円
              </div>
              <div style={{ fontSize: 13, color: "rgba(200,160,200,0.8)" }}>
                理論現金残高：<span style={{ color: "white", fontWeight: 700 }}>{yen(theoretical)}円</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
  );
}
