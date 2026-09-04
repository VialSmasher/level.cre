import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { isTelemetryQuery } from '@/lib/telemetryQueries'

type TelemetryState = { mode: 'connecting' | 'live' | 'polling' | 'offline' | 'demo'; lastSyncedAt: number | null }
const TelemetryContext = createContext<TelemetryState>({ mode: 'connecting', lastSyncedAt: null })
export const useTelemetry = () => useContext(TelemetryContext)

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const { user, session, isDemoMode } = useAuth()
  const [state, setState] = useState<TelemetryState>({ mode: 'connecting', lastSyncedAt: null })
  const token = useRef(session?.access_token)
  useEffect(() => {
    token.current = session?.access_token
    if (supabase && session?.access_token) void supabase.realtime.setAuth(session.access_token)
  }, [session?.access_token])

  useEffect(() => {
    if (!user || isDemoMode) {
      setState({ mode: isDemoMode ? 'demo' : 'connecting', lastSyncedAt: null })
      return
    }
    let disposed = false
    let flushing = false
    let again = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      if (disposed || document.hidden || !navigator.onLine) return
      if (flushing) { again = true; return }
      flushing = true
      try {
        await queryClient.invalidateQueries({ predicate: query => isTelemetryQuery(query.queryKey), refetchType: 'active' }, { throwOnError: true })
        if (!disposed) setState(previous => ({ ...previous, lastSyncedAt: Date.now() }))
      } catch {
        if (!disposed) setState(previous => ({ ...previous, mode: navigator.onLine ? 'polling' : 'offline' }))
      } finally {
        flushing = false
        if (again && !disposed) { again = false; schedule() }
      }
    }
    const schedule = () => {
      if (disposed || timer) return
      timer = setTimeout(() => { timer = undefined; void refresh() }, 300)
    }
    const mode = (value: TelemetryState['mode']) => {
      if (!disposed) setState(previous => ({ ...previous, mode: value }))
    }
    const resume = () => {
      if (!navigator.onLine) { mode('offline'); return }
      if (!document.hidden) schedule()
    }
    setState({ mode: navigator.onLine ? 'connecting' : 'offline', lastSyncedAt: null })
    const channel = supabase?.channel('levelcre:user:' + user.id, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, schedule)
    if (channel && supabase) {
      void supabase.realtime.setAuth(token.current).then(() => {
        if (disposed) return
        channel.subscribe(status => {
          if (status === 'SUBSCRIBED') { mode('live'); schedule() }
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') mode(navigator.onLine ? 'polling' : 'offline')
        })
      }).catch(() => mode('polling'))
    } else mode('polling')
    // Catch up after subscribe as well as on mount. The fallback also covers
    // missed messages, background tabs and deployments without Realtime.
    schedule()
    const poll = setInterval(schedule, 30_000)
    const connectingTimeout = setTimeout(() => {
      if (!disposed) setState(previous => previous.mode === 'connecting' ? { ...previous, mode: 'polling' } : previous)
    }, 10_000)
    window.addEventListener('online', resume)
    window.addEventListener('offline', resume)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      disposed = true
      clearTimeout(timer); clearTimeout(connectingTimeout); clearInterval(poll)
      window.removeEventListener('online', resume); window.removeEventListener('offline', resume); window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
      if (channel && supabase) void supabase.removeChannel(channel)
    }
  }, [user?.id, isDemoMode])
  return <TelemetryContext.Provider value={state}>{children}</TelemetryContext.Provider>
}
