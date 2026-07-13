import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type RouteErrorBoundaryProps = {
  children: ReactNode
}

type RouteErrorBoundaryState = {
  error: Error | null
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route render failed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f3f5f7] px-4 py-10 sm:px-6">
        <div role="alert" className="w-full max-w-xl rounded-md border border-rose-200 border-t-4 border-t-rose-500 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-rose-700">Level CRE could not render this view</p>
              <h1 className="mt-1 text-xl font-semibold text-slate-950">This screen failed to load</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Reload once to clear temporary map or sign-in state. The diagnostic below is preserved if the problem continues.
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Diagnostic</p>
            <p className="mt-1 max-h-24 overflow-auto break-words font-mono text-xs leading-5 text-slate-700">
              {this.state.error.message}
            </p>
          </div>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            Reload screen
          </Button>
        </div>
      </div>
    )
  }
}
