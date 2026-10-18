import Link from "next/link";
import type { ReactNode } from "react";

/** Header link styled like the shared ghost button. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-muted transition hover:bg-border/50 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </Link>
  );
}
