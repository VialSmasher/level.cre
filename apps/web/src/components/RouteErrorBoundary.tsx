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
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-6">
        <div className="max-w-lg rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">This screen failed to load</h1>
          <p className="mt-2 text-sm text-slate-600">
            The route hit a runtime error instead of rendering. Reloading usually clears transient map or auth state.
          </p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-2xl bg-slate-100 p-3 text-left text-xs text-slate-600">
            {this.state.error.message}
          </pre>
          <Button className="mt-5 rounded-full" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload screen
          </Button>
        </div>
      </div>
    )
  }
}
