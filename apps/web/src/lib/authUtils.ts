export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

export function getOAuthCallbackPath(options?: { includeHashTokens?: boolean }): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const includeHashTokens = options?.includeHashTokens ?? true
  const searchParams = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  const hasAuthCode = searchParams.has('code')
  const hasHashTokens = includeHashTokens && (
    hashParams.has('access_token') ||
    hashParams.has('refresh_token')
  )

  if (!hasAuthCode && !hasHashTokens) {
    return null
  }

  return `/auth/callback${window.location.search}${window.location.hash}`
}
