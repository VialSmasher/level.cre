import * as React from "react"

import { cn } from "@/lib/utils"

function DataPanel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn("rounded-lg border border-border bg-card text-card-foreground", className)}
      {...props}
    />
  )
}

function DataPanelHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", className)}
      {...props}
    />
  )
}

function DataPanelTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-sm font-semibold leading-5 text-foreground", className)} {...props} />
}

function DataPanelDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-muted-foreground", className)} {...props} />
}

function DataPanelContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />
}

export { DataPanel, DataPanelHeader, DataPanelTitle, DataPanelDescription, DataPanelContent }

