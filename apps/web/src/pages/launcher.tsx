import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { ChartSpline, Loader2 } from 'lucide-react'

export default function LauncherPage() {
  const [, setLocation] = useLocation()

  useEffect(() => {
    setLocation('/app/desk')
  }, [setLocation])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f5f7] text-slate-950">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <span className="inline-flex items-center gap-1 text-lg font-black text-slate-950">
          level CRE
          <ChartSpline className="h-4 w-4 text-blue-600" />
        </span>
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      </div>
    </div>
  )
}
