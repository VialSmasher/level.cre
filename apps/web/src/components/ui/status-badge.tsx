import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-5",
  {
    variants: {
      tone: {
        neutral: "border-slate-200 bg-slate-50 text-slate-700",
        info: "border-blue-200 bg-blue-50 text-blue-800",
        success: "border-emerald-200 bg-emerald-50 text-emerald-800",
        warning: "border-amber-200 bg-amber-50 text-amber-800",
        danger: "border-red-200 bg-red-50 text-red-800",
        review: "border-violet-200 bg-violet-50 text-violet-800",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {}

function StatusBadge({ className, tone, ...props }: StatusBadgeProps) {
  return <span className={cn(statusBadgeVariants({ tone }), className)} {...props} />
}

export { StatusBadge, statusBadgeVariants }

