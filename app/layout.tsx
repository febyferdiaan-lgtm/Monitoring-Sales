import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PT. MDA Amanah Sejahtera Monitoring RAB",
  description: "Aplikasi internal Monitoring RAB PT. MDA Amanah Sejahtera.",
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
