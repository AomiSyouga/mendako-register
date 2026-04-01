"use client";

import { useState } from "react";
import { Wallet } from "@/lib/types";

const DEFAULT_TAGS = [
  "ポーチ", "かばん", "アート", "家具", "ボックス",
  "アクリルキーホルダー", "メガネケース", "カードケース", "財布",
];
const TAGS_KEY = "mendako_v0_tags";

function loadTags(): string[] {
  if (typeof window === "undefined") return DEFAULT_TAGS;
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_TAGS;
  } catch { return DEFAULT_TAGS; }
}

function saveTags(tags: string[]) {
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
}

type Props = {
  wallets: Wallet[];
  setWallets: (wallets: Wallet[]) => void;
};

export function TabSettings({ wallets, setWallets }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [tags, setTags] = useState<string[]>(loadTags);
  const [newTag, setNewTag] = useState("");
  const [editingTagIdx, setEditingTagIdx] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState("");

  function startEdit(w: Wallet) { setEditingId(w.id); setEditingName(w.name); }
  function saveEdit() {
    if (!editingId) return;
    const updated = wallets.map(w => w.id === editingId ? { ...w, name: editingName } : w);
    setWallets(updated); setEditingId(null);
  }
  function addWallet() {
    const newWallet: Wallet = { id: "wallet_" + Date.now(), name: "新しいウォレット" };
    const updated = [...wallets, newWallet];
    setWallets(updated);
    setEditingId(newWallet.id); setEditingName(newWallet.name);
  }
  function deleteWallet(id: string) {
    if (wallets.length <= 1) return;
    const updated = wallets.filter(w => w.id !== id);
    setWallets(updated);
  }
  function moveWallet(idx: number, dir: -1 | 1) {
    const updated = [...wallets];
    const target = idx + dir;
    if (target < 0 || target >= updated.length) return;
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    setWallets(updated);
  }

  function addTag() {
    const t = newTag.trim();
    if (!t || tags.includes(t)) return;
    const updated = [...tags, t];
    setTags(updated); saveTags(updated); setNewTag("");
  }
  function deleteTag(idx: number) {
    const updated = tags.filter((_, i) => i !== idx);
    setTags(updated); saveTags(updated);
  }
  function saveTagEdit(idx: number) {
    const t = editingTagName.trim();
    if (!t) return;
    const updated = tags.map((tag, i) => i === idx ? t : tag);
    setTags(updated); saveTags(updated); setEditingTagIdx(null);
  }

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(220,160,220,0.18)",
    borderRadius: 18, padding: "20px 18px", marginBottom: 16,
  };
  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(220,160,220,0.35)",
    borderRadius: 12, color: "white",
    padding: "12px 16px", fontSize: 16,
    fontFamily: "inherit", outline: "none", flex: 1,
  };
  const btnSm: React.CSSProperties = {
    padding: "10px 16px", borderRadius: 10, fontSize: 14,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(220,160,220,0.25)",
    color: "white", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };
  const btnDanger: React.CSSProperties = {
    ...btnSm, border: "1px solid rgba(255,100,100,0.3)", color: "#ff9090",
  };
  const btnSave: React.CSSProperties = {
    padding: "10px 20px", borderRadius: 10, fontSize: 14, fontWeight: 700,
    background: "rgba(220,100,220,0.35)", border: "1px solid rgba(220,120,220,0.5)",
    color: "white", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };
  const btnMove: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 8, fontSize: 14,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(220,160,220,0.2)",
    color: "rgba(220,180,220,0.8)", cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#f0c0f0", marginBottom: 16, letterSpacing: "0.05em" }}>
        ⚙️ 設定
      </div>

      {/* ウォレット管理 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#f0c0f0", marginBottom: 6 }}>ウォレット管理</div>
        <div style={{ fontSize: 14, color: "rgba(200,160,200,0.7)", marginBottom: 18 }}>名前を自由に変更・追加・削除できます</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {wallets.map((w, idx) => (
            <li key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button style={{ ...btnMove, opacity: idx === 0 ? 0.2 : 1 }} onClick={() => moveWallet(idx, -1)} disabled={idx === 0}>▲</button>
                <button style={{ ...btnMove, opacity: idx === wallets.length - 1 ? 0.2 : 1 }} onClick={() => moveWallet(idx, 1)} disabled={idx === wallets.length - 1}>▼</button>
              </div>
              {editingId === w.id ? (
                <>
                  <input style={inputStyle} value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit()} autoFocus />
                  <button style={btnSave} onClick={saveEdit}>保存</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 16, padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(220,160,220,0.12)", borderRadius: 12, color: "white" }}>{w.name}</span>
                  <button style={btnSm} onClick={() => startEdit(w)}>編集</button>
                  <button style={{ ...btnDanger, opacity: wallets.length <= 1 ? 0.3 : 1 }} onClick={() => deleteWallet(w.id)} disabled={wallets.length <= 1}>削除</button>
                </>
              )}
            </li>
          ))}
        </ul>
        <button onClick={addWallet} style={{
          width: "100%", padding: "14px", marginTop: 4, borderRadius: 12, fontSize: 16,
          background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(220,160,220,0.3)",
          color: "rgba(220,160,220,0.8)", cursor: "pointer", fontFamily: "inherit",
        }}>＋ ウォレットを追加</button>
      </div>

      {/* タグ管理 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#f0c0f0", marginBottom: 6 }}>タグ管理</div>
        <div style={{ fontSize: 14, color: "rgba(200,160,200,0.7)", marginBottom: 18 }}>商品タグを自由に変更・追加・削除できます</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {tags.map((tag, idx) => (
            <li key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              {editingTagIdx === idx ? (
                <>
                  <input style={inputStyle} value={editingTagName} onChange={e => setEditingTagName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveTagEdit(idx)} autoFocus />
                  <button style={btnSave} onClick={() => saveTagEdit(idx)}>保存</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 16, padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(220,160,220,0.12)", borderRadius: 12, color: "white" }}>{tag}</span>
                  <button style={btnSm} onClick={() => { setEditingTagIdx(idx); setEditingTagName(tag); }}>編集</button>
                  <button style={btnDanger} onClick={() => deleteTag(idx)}>削除</button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <input
            style={{ ...inputStyle, fontSize: 14, padding: "10px 14px" }}
            placeholder="新しいタグ名"
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTag()}
          />
          <button style={btnSave} onClick={addTag}>追加</button>
        </div>
      </div>

      {/* ログアウト */}
      <div style={cardStyle}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#f0c0f0", marginBottom: 6 }}>🚪 ログアウト</div>
        <div style={{ fontSize: 14, color: "rgba(200,160,200,0.7)", marginBottom: 18 }}>Googleアカウントからログアウトします</div>
        <button onClick={async () => {
          const { supabase } = await import("@/lib/supabaseClient");
          await supabase.auth.signOut();
          window.location.reload();
        }} style={{
          width: "100%", padding: "14px", borderRadius: 12, fontSize: 16, fontWeight: 700,
          background: "rgba(255,80,80,0.2)",
          border: "1px solid rgba(255,100,100,0.3)",
          color: "#ff9090", cursor: "pointer", fontFamily: "inherit",
        }}>ログアウト</button>
      </div>
    </div>
  );
}
