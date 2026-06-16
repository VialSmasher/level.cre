import * as React from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

function DataTableToolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-2 pb-3", className)} {...props} />
}

function DataTableEmpty({
  className,
  colSpan,
  children = "No records found.",
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className={cn("h-28 text-center text-sm text-muted-foreground", className)} {...props}>
        {children}
      </TableCell>
    </TableRow>
  )
}

function DataTableLoadingRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <TableCell key={columnIndex}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export { DataTableToolbar, DataTableEmpty, DataTableLoadingRows }

