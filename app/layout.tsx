import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monitoring Sales MDA",
  description: "Aplikasi internal monitoring penjualan PT MDA Amanah Sejahtera.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/mda-logo.svg",
    shortcut: "/mda-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
