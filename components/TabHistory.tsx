"use client";

import { useLocalStore } from "@/lib/useLocalStore";
import { Wallet, Product, ArchivedEvent } from "@/lib/types";
import { useState } from "react";

function yen(n: number) { return n.toLocaleString("ja-JP"); }

type Props = { wallets: Wallet[]; products: Product[] };

export function TabHistory({ wallets, products }: Props) {
  const { state, setState } = useLocalStore();
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  // 現在進行中 + アーカイブ済みを統合して表示
  const archivedEvents: ArchivedEvent[] = state.archivedEvents ?? [];

  // 現在進行中イベント（sales がある場合だけ表示）
  const currentEvent: ArchivedEvent | null = state.sales.length > 0 && state.startAt && !state.endAt ? {
    id: "__current__",
    eventName: state.eventName || "（進行中）",
    eventDate: state.eventDate || "",
    startAt: state.startAt,
    endAt: state.endAt,
    cashFloatByWallet: state.cashFloatByWallet,
    sales: state.sales,
    gifts: state.gifts,
  } : null;

  const allEvents = currentEvent
  ? [currentEvent, ...[...archivedEvents].reverse()]
  : [...archivedEvents].reverse();

  function removeSale(eventId: string, saleId: string) {
    if (eventId === "__current__") {
      setState(s => ({ ...s, sales: s.sales.filter(x => x.id !== saleId) }));
    } else {
      setState(s => ({
        ...s,
        archivedEvents: s.archivedEvents.map(ev =>
          ev.id === eventId
            ? { ...ev, sales: ev.sales.filter(x => x.id !== saleId) }
            : ev
        ),
      }));
    }
  }
  

  function downloadCSV(ev: ArchivedEvent) {
    const rows: string[][] = [];

    rows.push(["【売上履歴】"]);
    rows.push(["日時", "商品名", "ウォレット", "支払い", "金額"]);
    for (const s of [...ev.sales].reverse()) {
      const wName = wallets.find(w => w.id === s.walletId)?.name ?? s.walletId;
      const pName = s.productId ? products.find(p => p.id === s.productId)?.name ?? "" : "";
      rows.push([
        new Date(s.at).toLocaleString(),
        pName,
        wName,
        s.payment === "cash" ? "現金" : "キャッシュレス",
        String(s.amount),
      ]);
    }

    rows.push([]);
    rows.push(["【ウォレット別売上サマリー】"]);
    rows.push(["ウォレット", "売上合計", "現金売上", "キャッシュレス売上", "初期釣り銭", "理論現金残高"]);
    for (const w of wallets) {
      const wSales = ev.sales.filter(s => s.walletId === w.id);
      const total = wSales.reduce((a, s) => a + s.amount, 0);
      const cash = wSales.filter(s => s.payment === "cash").reduce((a, s) => a + s.amount, 0);
      const cashless = total - cash;
      const float = (ev.cashFloatByWallet ?? {})[w.id] ?? 0;
      rows.push([w.name, String(total), String(cash), String(cashless), String(float), String(float + cash)]);
    }

    rows.push([]);
    rows.push(["【商品別売上】"]);
    rows.push(["商品名", "販売数", "売上合計", "ウォレット"]);
    const productMap: Record<string, { name: string; walletName: string; qty: number; total: number }> = {};
    for (const s of ev.sales) {
      if (!s.productId) continue;
      const p = products.find(p => p.id === s.productId);
      if (!p) continue;
      if (!productMap[s.productId]) {
        productMap[s.productId] = {
          name: p.name,
          walletName: wallets.find(w => w.id === p.walletId)?.name ?? "",
          qty: 0, total: 0,
        };
      }
      productMap[s.productId].qty += 1;
      productMap[s.productId].total += s.amount;
    }
    for (const v of Object.values(productMap)) {
      rows.push([v.name, String(v.qty), String(v.total), v.walletName]);
    }

    rows.push([]);
    rows.push(["【差し入れメモ】"]);
    rows.push(["時刻", "名前", "内容", "お礼済み"]);
    for (const g of (ev.gifts ?? [])) {
      rows.push([new Date(g.at).toLocaleString(), g.fromName, g.content, g.thanked ? "済" : "未"]);
    }

    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ev.eventDate}_${ev.eventName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(220,160,220,0.18)",
    borderRadius: 18, padding: "16px", marginBottom: 12,
  };

  if (allEvents.length === 0) {
    return (
      <div style={{ padding: "4px 0" }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 15, color: "rgba(200,160,200,0.6)", textAlign: "center", padding: "20px 0" }}>
            まだ記録がありません
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "4px 0" }}>
      {allEvents.map(ev => {
        const isOpen = openEventId === ev.id;
        const total = (ev.sales ?? []).reduce(
  (a, s) => a + (s?.amount ?? 0),
  0
);

        return (
          <div key={ev.id} style={cardStyle}>
            {/* イベントヘッダー */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div
                style={{ flex: 1, cursor: "pointer" }}
                onClick={() => setOpenEventId(isOpen ? null : ev.id)}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: ev.id === "__current__" ? "#b0f0b0" : "#f0c0f0" }}>
                  {ev.id === "__current__" && "🟢 "}
                  {ev.eventName || "イベント名未設定"}
                </div>
                <div style={{ fontSize: 12, color: "rgba(200,160,200,0.7)", marginTop: 2 }}>
                  📅 {ev.eventDate || "日付未設定"} ／ {ev.sales.length}件 ／ 合計 {yen(total)}円
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
                <button
                  onClick={() => downloadCSV(ev)}
                  style={{
                    padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                    background: "linear-gradient(135deg, rgba(100,180,100,0.5), rgba(60,140,100,0.5))",
                    border: "1px solid rgba(100,200,100,0.4)",
                    color: "white", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  📥 CSV
                </button>
                <button
                  onClick={() => setOpenEventId(isOpen ? null : ev.id)}
                  style={{
                    padding: "8px 12px", borderRadius: 10, fontSize: 12,
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(220,160,220,0.25)",
                    color: "white", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {isOpen ? "▲" : "▼"}
                </button>
              </div>
            </div>

            {/* 明細（展開時） */}
            {isOpen && (
              <div style={{ marginTop: 12, borderTop: "1px solid rgba(220,160,220,0.15)", paddingTop: 12 }}>
                {ev.sales.length === 0 ? (
                  <div style={{ fontSize: 13, color: "rgba(200,160,200,0.5)", textAlign: "center", padding: "12px 0" }}>
                    記録なし
                  </div>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {ev.sales.map(s => {
                      const wName = wallets.find(w => w.id === s.walletId)?.name ?? s.walletId;
                      const pName = s.productId ? products.find(p => p.id === s.productId)?.name : undefined;
                      return (
                        <li key={s.id} style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(220,160,220,0.15)",
                          borderRadius: 12, padding: "10px 12px",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          gap: 10, marginBottom: 6,
                        }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{yen(s.amount)}円</div>
                            <div style={{ fontSize: 12, color: "rgba(200,160,200,0.75)" }}>
                              {pName && <span style={{ marginRight: 4 }}>🛍️{pName} ／</span>}
                              {wName} ／ {s.payment === "cash" ? "💴現金" : "📱キャッシュレス"} ／ {new Date(s.at).toLocaleTimeString()}
                            </div>
                          </div>
                          <button
                            onClick={() => removeSale(ev.id, s.id)}
                            style={{
                              padding: "4px 10px", borderRadius: 8, fontSize: 12,
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(220,160,220,0.25)",
                              color: "white", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                            }}
                          >
                            取消
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {(ev.gifts ?? []).length > 0 && (
  <div style={{ marginTop: 12, borderTop: "1px solid rgba(220,160,220,0.1)", paddingTop: 12 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: "#f0c0f0", marginBottom: 8 }}>🎁 差し入れ（{(ev.gifts ?? []).length}件）</div>
    {(ev.gifts ?? []).map(g => (
      <div key={g.id} style={{
        background: g.thanked ? "rgba(100,200,100,0.06)" : "rgba(255,255,255,0.04)",
        border: g.thanked ? "1px solid rgba(100,200,100,0.2)" : "1px solid rgba(220,160,220,0.15)",
        borderRadius: 12, padding: "10px 12px", marginBottom: 6,
        display: "flex", gap: 10, alignItems: "flex-start",
      }}>
        {g.imageDataUrl && (
          <img src={g.imageDataUrl} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f0c0f0" }}>
            {g.fromName || "名前なし"}
            {g.thanked && <span style={{ marginLeft: 6, fontSize: 11, color: "#90f090" }}>✅ お礼済</span>}
          </div>
          <div style={{ fontSize: 12, color: "rgba(200,160,200,0.8)", marginTop: 2 }}>{g.content}</div>
          <div style={{ fontSize: 11, color: "rgba(180,140,180,0.6)", marginTop: 2 }}>
            {new Date(g.at).toLocaleString()}
          </div>
        </div>
      </div>
    ))}
  </div>
)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}