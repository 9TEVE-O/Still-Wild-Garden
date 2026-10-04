import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Stillwild — A little world of your own",
  description: "One seed. A quiet cloud of keepers. A living pixel garden that unfolds in its own time.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-AU"><body>{children}</body></html>; }
