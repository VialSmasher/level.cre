const STORAGE_KEY = 'post-auth-redirect'
const POST_AUTH_PENDING_KEY = 'post-auth-pending'
const POST_AUTH_PENDING_TTL_MS = 15_000

const ALLOWLIST = new Set([
  '/app',
  '/launcher',
  '/tools/industrial-intel',
  '/tools/industrial-intel/listings',
  '/tools/industrial-intel/requirements',
])

export function sanitizePostAuthRedirect(value?: string | null): string | null {
  if (!value) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  return ALLOWLIST.has(value) ? value : null
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
