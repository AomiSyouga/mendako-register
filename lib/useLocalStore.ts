"use client";

import { useEffect, useState } from "react";
import { EventState } from "./types";
import { loadState, saveState, defaultState } from "./storage";

export function useLocalStore() {
  const [state, setState] = useState<EventState>(defaultState);
  const [ready, setReady] = useState(false);

  // 初回ロード
  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setReady(true);
  }, []);

  // state変更時に保存
  useEffect(() => {
    if (!ready) return;
    saveState(state);
  }, [state, ready]);

  // 🔥 これが追加部分
  // 外部から完全リセットされた時に同期する
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "mendako_v0_state") {
        const fresh = loadState();
        setState(fresh);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return { state, setState, ready };
}