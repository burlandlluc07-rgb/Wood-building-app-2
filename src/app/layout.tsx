import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "NestForge — Cut List & Layout Optimizer",
  description:
    "Workshop cut-list optimizer: sheet goods, dimensioned lumber, and rough-milled stock. Layouts, board-feet, BOM and costing in one place.",
};

// Sets the theme attribute before React hydrates so there's no flash of
// the wrong theme on load. Keep this in sync with theme-toggle.tsx's
// STORAGE_KEY.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    if (localStorage.getItem("nestforge-theme") === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-screen antialiased">
        <div className="fixed right-4 top-4 z-50 no-print">
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
