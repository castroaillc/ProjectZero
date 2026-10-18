import type { ButtonHTMLAttributes } from "react";
import { cn } from "../cn";

const variants = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  ghost: "text-muted hover:bg-border/50 hover:text-fg",
  danger: "text-danger hover:bg-danger/10",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: "md" | "icon";
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "md" ? "h-10 px-4" : "size-9",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
