const STORAGE_KEY = 'post-auth-redirect'
const POST_AUTH_PENDING_KEY = 'post-auth-pending'
const POST_AUTH_PENDING_TTL_MS = 15_000
const INTERNAL_BASE_URL = 'https://level-cre.local'
const EXACT_ALLOWLIST = new Set([
  '/broker-stats',
  '/launcher',
  '/leaderboard',
])
const PREFIX_ALLOWLIST = [
  '/app',
  '/tools/industrial-intel',
]
const TOOL_A_EXACT_ALLOWLIST = new Set([
  '/broker-stats',
  '/leaderboard',
])
const TOOL_A_PREFIX_ALLOWLIST = ['/app']

function normalizePathname(pathname: string): string {
  if (pathname === '/') return pathname
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}

function hasAllowedPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function isAllowedPathname(pathname: string): boolean {
  return (
    EXACT_ALLOWLIST.has(pathname) ||
    PREFIX_ALLOWLIST.some((prefix) => hasAllowedPrefix(pathname, prefix))
  )
}

function isToolAPathname(pathname: string): boolean {
  return (
    TOOL_A_EXACT_ALLOWLIST.has(pathname) ||
    TOOL_A_PREFIX_ALLOWLIST.some((prefix) => hasAllowedPrefix(pathname, prefix))
  )
}

export function sanitizePostAuthRedirect(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return null
  if (trimmed.startsWith('//')) return null

  try {
    const url = new URL(trimmed, INTERNAL_BASE_URL)
    const pathname = normalizePathname(url.pathname)
    if (!isAllowedPathname(pathname)) return null
    return `${pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function isToolAPostAuthRedirect(value?: string | null): boolean {
  const sanitized = sanitizePostAuthRedirect(value)
  if (!sanitized) return false

  try {
    const url = new URL(sanitized, INTERNAL_BASE_URL)
    return isToolAPathname(normalizePathname(url.pathname))
  } catch {
    return false
  }
}

export function getStoredPostAuthRedirect(): string | null {
  try {
    return sanitizePostAuthRedirect(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function clearStoredPostAuthRedirect() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function markPostAuthPending() {
  try {
    sessionStorage.setItem(POST_AUTH_PENDING_KEY, String(Date.now()))
  } catch {}
}

export function hasPostAuthPending(): boolean {
  try {
    const raw = sessionStorage.getItem(POST_AUTH_PENDING_KEY)
    if (!raw) return false

    const startedAt = Number(raw)
    if (!Number.isFinite(startedAt)) return true

    if (Date.now() - startedAt > POST_AUTH_PENDING_TTL_MS) {
      sessionStorage.removeItem(POST_AUTH_PENDING_KEY)
      return false
    }

    return true
  } catch {
    return false
  }
}

export function clearPostAuthPending() {
  try {
    sessionStorage.removeItem(POST_AUTH_PENDING_KEY)
  } catch {}
}

export function setStoredPostAuthRedirect(value?: string | null) {
  const sanitized = sanitizePostAuthRedirect(value)
  try {
    if (sanitized) {
      localStorage.setItem(STORAGE_KEY, sanitized)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {}
}

export function consumeStoredPostAuthRedirect(): string | null {
  const value = getStoredPostAuthRedirect()
  clearStoredPostAuthRedirect()
  return value
}
