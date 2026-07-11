import type { ComponentType, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type PageHeaderProps = {
  label: string
  title: string
  description?: string
  icon?: ComponentType<{ className?: string }>
  actions?: ReactNode
  className?: string
}

export function PageHeader({ label, title, description, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          {Icon ? <Icon className="h-4 w-4 text-blue-600" /> : null}
          <span>{label}</span>
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold text-slate-950">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
