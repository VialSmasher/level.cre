import * as React from "react"

import { cn } from "@/lib/utils"

function PageHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-border bg-background px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between",
        className
      )}
      {...props}
    />
  )
}

function PageHeaderContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 space-y-1", className)} {...props} />
}

function PageTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn("truncate text-2xl font-semibold tracking-normal text-foreground", className)}
      {...props}
    />
  )
}

function PageDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("max-w-3xl text-sm text-muted-foreground", className)} {...props} />
}

function PageActions({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 flex-wrap items-center gap-2", className)} {...props} />
}

export { PageHeader, PageHeaderContent, PageTitle, PageDescription, PageActions }

