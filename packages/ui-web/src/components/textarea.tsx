import type { TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm",
        "placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
        className,
      )}
      {...props}
    />
  );
}
