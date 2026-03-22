"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Conversations" },
  { href: "/memory", label: "Memory Explorer" },
] as const;

export function NavHeader() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-[var(--s1)]">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/" || pathname.startsWith("/conversation")
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-[var(--s3)] py-[var(--s1)] rounded-sm text-sm font-medium no-underline transition-colors ${
              isActive
                ? "bg-accent-dim text-accent border border-accent-border"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-raised"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
