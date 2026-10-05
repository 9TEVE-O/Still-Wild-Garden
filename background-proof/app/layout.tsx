import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Stillwild · Background garden proof",
  description: "An isolated Darwin garden recording weather and keeper consequences between visits. Background proof remains pending.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-AU"><body>{children}</body></html>; }
