"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Register } from "@/components/Register";
import { TabProducts } from "@/components/TabProducts";
import { TabHistory } from "@/components/TabHistory";
import { TabSettings } from "@/components/TabSettings";

import { loadProducts, loadWallets, saveProducts, saveWallets } from "@/lib/storage";
import type { Product, Wallet } from "@/lib/types";

type TabId = "register" | "products" | "history" | "settings";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("register");

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
  const init = async () => {
    const [w, p] = await Promise.all([loadWallets(), loadProducts()]);
    setWallets(w);
    setProducts(p);
  };
  init();
}, []);

  const tabs = useMemo(
    () => [
     { id: "register" as const, label: "レジ", icon: <img src="/mendako-register.png" alt="" style={{ width: 22, height: 22, objectFit: "contain" }} /> },
      { id: "products" as const, label: "商品", icon: "🧾" },
      { id: "history" as const, label: "履歴", icon: "🌊" },
      { id: "settings" as const, label: "設定", icon: "⚙️" },
    ],
    []
  );

  const Background = (
    <>
      <div className="deep-sea-bg" />
      {/* 泡：数は軽めに */}
      <div className="bubble" style={{ width: 10, height: 10, left: "10%", animationDuration: "18s", animationDelay: "0s" }} />
      <div className="bubble" style={{ width: 14, height: 14, left: "22%", animationDuration: "22s", animationDelay: "1.2s" }} />
      <div className="bubble" style={{ width: 18, height: 18, left: "34%", animationDuration: "26s", animationDelay: "2.4s" }} />
      <div className="bubble" style={{ width: 22, height: 22, left: "46%", animationDuration: "30s", animationDelay: "0.8s" }} />
      <div className="bubble" style={{ width: 28, height: 28, left: "58%", animationDuration: "34s", animationDelay: "1.8s" }} />
      <div className="bubble" style={{ width: 36, height: 36, left: "70%", animationDuration: "40s", animationDelay: "2.1s" }} />
      <div className="bubble" style={{ width: 44, height: 44, left: "82%", animationDuration: "46s", animationDelay: "0.4s" }} />
      <div className="bubble" style={{ width: 26, height: 26, left: "94%", animationDuration: "38s", animationDelay: "1.4s" }} />
    </>
  );

  return (
    <>
      {Background}

      <div className="app-wrapper">
        <header className="app-header glass">
          <div className="app-title">
  <img src="/mendako-register.png" alt="" style={{ width: 28, height: 28, objectFit: "contain", verticalAlign: "middle", marginRight: 6 }} />
  めんだこれじ v0.1 🌊
</div>
        </header>

        <nav className="tab-nav glass">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <main className="app-main">
          {activeTab === "register" && <Register wallets={wallets} products={products} />}

          {activeTab === "products" && (
            <TabProducts
              products={products}
              setProducts={(p) => {
                setProducts(p);
                saveProducts(p);
              }}
              wallets={wallets}
            />
          )}

          {activeTab === "history" && <TabHistory wallets={wallets} products={products} />}

          {activeTab === "settings" && (
            <TabSettings
              wallets={wallets}
              setWallets={(w) => {
                setWallets(w);
                saveWallets(w);
              }}
            />
          )}
        </main>
      </div>
    </>
  );
}