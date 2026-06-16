import * as React from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function LoadingState({ className, rows = 4, ...props }: React.HTMLAttributes<HTMLDivElement> & { rows?: number }) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  )
}

export { LoadingState }

