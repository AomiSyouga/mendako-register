"use client";

import { useState } from "react";
import { Product, ProductTag, Wallet } from "@/lib/types";
import { saveProducts } from "@/lib/storage";

const TAGS_KEY = "mendako_v0_tags";
const DEFAULT_TAGS = ["ポーチ", "かばん", "アート", "家具", "ボックス", "アクリルキーホルダー", "メガネケース", "カードケース", "財布"];

function loadTags(): string[] {
  if (typeof window === "undefined") return DEFAULT_TAGS;
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_TAGS;
  } catch { return DEFAULT_TAGS; }
}

type Props = {
  products: Product[];
  setProducts: (products: Product[]) => void;
  wallets: Wallet[];
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function TabProducts({ products, setProducts, wallets }: Props) {
  const [allTags] = useState<string[]>(loadTags);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", price: "", walletId: "", imageDataUrl: "", tags: [] as ProductTag[] });

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(220,160,220,0.18)",
    borderRadius: 18,
    padding: "20px 18px",
    marginBottom: 16,
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(220,160,220,0.35)",
    borderRadius: 12,
    color: "white",
    padding: "12px 16px",
    fontSize: 17,
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    color: "rgba(220,180,220,0.8)",
    marginBottom: 6,
    display: "block",
  };

  function openNew() {
    setEditingId("__new__");
    setForm({ name: "", price: "", walletId: wallets[0]?.id ?? "", imageDataUrl: "", tags: [] });
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({ name: p.name, price: String(p.price), walletId: p.walletId, imageDataUrl: p.imageDataUrl ?? "", tags: p.tags ?? [] });
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL("image/jpeg", 0.6);
      setForm(f => ({ ...f, imageDataUrl: compressed }));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function toggleTag(tag: ProductTag) {
    setForm(f => {
      const has = f.tags.includes(tag);
      if (has) return { ...f, tags: f.tags.filter(t => t !== tag) };
      if (f.tags.length >= 3) return f;
      return { ...f, tags: [...f.tags, tag] };
    });
  }

  function save() {
    const price = Number(form.price);
    if (!form.name || !Number.isFinite(price) || price <= 0) return;

    if (editingId === "__new__") {
      const newProduct: Product = {
        id: uid(),
        name: form.name,
        price,
        walletId: form.walletId,
        tags: form.tags.length > 0 ? form.tags : undefined,
        imageDataUrl: form.imageDataUrl || undefined,
      };
      const updated = [...products, newProduct];
      setProducts(updated);
      saveProducts(updated);
    } else {
      const updated = products.map(p =>
        p.id === editingId
          ? { ...p, name: form.name, price, walletId: form.walletId, tags: form.tags.length > 0 ? form.tags : undefined, imageDataUrl: form.imageDataUrl || undefined }
          : p
      );
      setProducts(updated);
      saveProducts(updated);
    }
    setEditingId(null);
  }

  function deleteProduct(id: string) {
    const updated = products.filter(p => p.id !== id);
    setProducts(updated);
    saveProducts(updated);
  }

  const walletName = (id: string) => wallets.find(w => w.id === id)?.name ?? id;

  return (
    <>
      <style>{`
        select option { background: #1a0f3a; color: white; }
      `}</style>
      <div style={{ padding: "4px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f0c0f0", marginBottom: 16, letterSpacing: "0.05em" }}>
          🛍️ 商品
        </div>

        {/* フォーム（上に表示） */}
        {editingId && (
          <div style={cardStyle}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#f0c0f0", marginBottom: 16 }}>
              {editingId === "__new__" ? "新しい商品を登録" : "商品を編集"}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>画像（任意）</label>
              {form.imageDataUrl && (
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <img src={form.imageDataUrl} alt="preview" style={{
                    width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12,
                  }} />
                  <button onClick={() => setForm(f => ({ ...f, imageDataUrl: "" }))} style={{
                    position: "absolute", top: 8, right: 8,
                    padding: "4px 10px", borderRadius: 8, fontSize: 13,
                    background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,100,100,0.5)",
                    color: "#ff9090", cursor: "pointer", fontFamily: "inherit",
                  }}>✕ 削除</button>
                </div>
              )}
              <label style={{
                display: "inline-block", padding: "10px 16px", borderRadius: 10, fontSize: 13,
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(220,160,220,0.3)",
                color: "rgba(220,180,220,0.9)", cursor: "pointer",
              }}>
                📷 写真を選ぶ
                <input type="file" accept="image/*"
                  style={{ display: "none" }} onChange={handleImage} />
              </label>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>商品名</label>
              <input style={inputStyle} placeholder="例：メンダコポーチ"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>値段（円）</label>
              <input style={inputStyle} inputMode="numeric" placeholder="例：1500"
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>作家タグ（ウォレット）</label>
              <select style={inputStyle} value={form.walletId}
                onChange={e => setForm(f => ({ ...f, walletId: e.target.value }))}>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>商品タグ（3つまで）</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {allTags.map(tag => {
                  const selected = form.tags.includes(tag as ProductTag);
                  return (
                    <button key={tag} onClick={() => toggleTag(tag as ProductTag)} style={{
                      padding: "8px 14px", borderRadius: 20, fontSize: 14,
                      background: selected ? "rgba(220,100,220,0.4)" : "rgba(255,255,255,0.06)",
                      border: selected ? "1px solid rgba(220,120,220,0.6)" : "1px solid rgba(220,160,220,0.2)",
                      color: selected ? "white" : "rgba(200,160,200,0.7)",
                      cursor: "pointer", fontFamily: "inherit",
                      opacity: !selected && form.tags.length >= 3 ? 0.3 : 1,
                    }}>{tag}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: "rgba(200,160,200,0.5)", marginTop: 6 }}>
                {form.tags.length}/3 選択中
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={save} style={{
                flex: 1, padding: "14px", borderRadius: 12, fontSize: 17, fontWeight: 700,
                background: "linear-gradient(135deg, rgba(180,60,180,0.6), rgba(100,60,180,0.6))",
                border: "1px solid rgba(220,120,220,0.4)", color: "white",
                cursor: "pointer", fontFamily: "inherit",
              }}>保存</button>
              <button onClick={() => setEditingId(null)} style={{
                padding: "14px 20px", borderRadius: 12, fontSize: 17,
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(220,160,220,0.25)",
                color: "white", cursor: "pointer", fontFamily: "inherit",
              }}>キャンセル</button>
            </div>
          </div>
        )}

        {/* 商品一覧 */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#f0c0f0" }}>登録済み商品</div>
            {!editingId && (
              <button onClick={openNew} style={{
                padding: "10px 18px", borderRadius: 10, fontSize: 15, fontWeight: 700,
                background: "linear-gradient(135deg, rgba(180,60,180,0.6), rgba(100,60,180,0.6))",
                border: "1px solid rgba(220,120,220,0.4)",
                color: "white", cursor: "pointer", fontFamily: "inherit",
              }}>＋ 追加</button>
            )}
          </div>

          {products.length === 0 ? (
            <div style={{ fontSize: 16, color: "rgba(200,160,200,0.6)", textAlign: "center", padding: "20px 0" }}>
              まだ商品が登録されていません
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {[...products].reverse().map(p => (
                <li key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 12, marginBottom: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(220,160,220,0.12)",
                  borderRadius: 14, padding: "12px 14px",
                }}>
                  {p.imageDataUrl && (
                    <img src={p.imageDataUrl} alt={p.name} style={{
                      width: 60, height: 60, objectFit: "cover", borderRadius: 10, flexShrink: 0,
                    }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
                    <div style={{ fontSize: 14, color: "rgba(200,160,200,0.75)", marginBottom: 4 }}>
                      {p.price.toLocaleString("ja-JP")}円 ／ {walletName(p.walletId)}
                    </div>
                    {p.tags && p.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {p.tags.map(tag => (
                          <span key={tag} style={{
                            padding: "2px 8px", fontSize: 12,
                            background: "rgba(220,100,220,0.2)",
                            border: "1px solid rgba(220,120,220,0.3)",
                            borderRadius: 6,
                          }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => openEdit(p)} style={{
                      padding: "8px 14px", borderRadius: 8, fontSize: 14,
                      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(220,160,220,0.25)",
                      color: "white", cursor: "pointer", fontFamily: "inherit",
                    }}>編集</button>
                    <button onClick={() => deleteProduct(p.id)} style={{
                      padding: "8px 14px", borderRadius: 8, fontSize: 14,
                      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,100,100,0.3)",
                      color: "#ff9090", cursor: "pointer", fontFamily: "inherit",
                    }}>削除</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
