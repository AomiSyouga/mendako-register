import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "めんだこれじ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        {/* ✅ 背景を常に敷く */}
        <div className="deep-sea-bg" />

        {/* ✅ 既存のガード */}
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}