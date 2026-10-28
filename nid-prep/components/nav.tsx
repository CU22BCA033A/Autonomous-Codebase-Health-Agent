"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface NavItem {
  href: string;
  label: string;
}

/** Bottom tab bar on phones, top bar on wider screens. */
export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur md:static md:border-b md:border-t-0"
    >
      <ul className="mx-auto flex max-w-3xl justify-around md:justify-start md:gap-2 md:px-4">
        {items.map((item) => {
          const active = item.href === "/" || item.href === "/admin" ? path === item.href : path.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 min-w-16 items-center justify-center px-3 text-sm",
                  active ? "font-semibold text-accent" : "text-ink-2",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
