import * as React from "react"

import { cn } from "@/lib/utils"

function EmptyState({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center",
        className
      )}
      {...props}
    />
  )
}

function EmptyStateTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-foreground", className)} {...props} />
}

function EmptyStateDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("max-w-md text-sm text-muted-foreground", className)} {...props} />
}

export { EmptyState, EmptyStateTitle, EmptyStateDescription }

