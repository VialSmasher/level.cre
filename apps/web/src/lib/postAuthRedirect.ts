const STORAGE_KEY = 'post-auth-redirect'

const ALLOWLIST = new Set([
  '/app',
  '/launcher',
  '/tools/industrial-intel',
  '/tools/industrial-intel/listings',
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
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
  return value
}
