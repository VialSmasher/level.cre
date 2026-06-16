import * as React from "react"

import { cn } from "@/lib/utils"

function CommandBar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      {...props}
    />
  )
}

function CommandBarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)} {...props} />
}

export { CommandBar, CommandBarGroup }

