import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { NavHeader } from "@/components/nav-header";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Bridge UI — Agent Conversations",
  description: "Visualize agent-to-agent interactions via the MCP bridge",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceGrotesk.className} bg-bg text-text-primary min-h-screen`}>
        <header className="flex items-center justify-between px-[var(--s6)] py-[var(--s4)] border-b border-border bg-bg sticky top-0 z-[100]">
          <Link href="/" className="flex items-center gap-[var(--s3)] no-underline text-text-primary">
            <div className="w-8 h-8 bg-accent-dim border border-accent-border rounded-sm flex items-center justify-center">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] text-accent">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">Bridge UI</span>
          </Link>
          <NavHeader />
          <div className="flex items-center gap-[var(--s2)]">
            <div className="w-2 h-2 rounded-full bg-reply shadow-[0_0_8px_var(--color-reply-border)]" />
            <span className="text-xs font-medium tracking-wide text-text-secondary">Connected to :3100</span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
