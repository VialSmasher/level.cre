import { Request, Response, NextFunction } from 'express'
// storage import intentionally omitted in dev/demo to avoid DB calls in restricted environments
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose'

// Build Supabase JWKS URL from env
function getSupabaseUrls() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  if (!supabaseUrl) return { supabaseUrl: undefined, jwksUrl: undefined, issuer: undefined }
  // Ensure no trailing slash
  const base = supabaseUrl.replace(/\/$/, '')
  const jwksUrl = `${base}/auth/v1/jwks`
  const issuer = `${base}/auth/v1`
  return { supabaseUrl: base, jwksUrl, issuer }
}

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getRemoteJwks() {
  if (!remoteJwks) {
    const { jwksUrl } = getSupabaseUrls()
    if (!jwksUrl) return null
    remoteJwks = createRemoteJWKSet(new URL(jwksUrl))
  }
  return remoteJwks
}

async function verifyBearerJWT(token: string): Promise<JWTPayload | null> {
  try {
    const jwks = getRemoteJwks()
    if (!jwks) return null
    const { issuer } = getSupabaseUrls()
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      // audience optional; Supabase uses aud: 'authenticated'
    })
    return payload
  } catch (err) {
    console.error('JWT verify failed:', (err as Error).message)
    return null
  }
}

// Supabase JWT verification middleware (stateless)
export async function verifySupabaseToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  // Demo mode is allowed for non-production usage and tests
  const allowDemo = process.env.DEMO_MODE === '1' || process.env.VITE_DEMO_MODE === '1' || req.app?.get('env') === 'development'
  if (allowDemo && req.headers['x-demo-mode'] === 'true') {
    ;(req as any).user = { id: 'demo-user' }
    // Do not touch DB in demo mode
    return next()
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No authentication token provided' })
  }

  const token = authHeader.slice(7)
  const payload = await verifyBearerJWT(token)
  if (!payload || !payload.sub) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  ;(req as any).user = {
    id: payload.sub,
    email: (payload as any).email,
    ...payload,
  }
  next()
}

// Extract user ID from request (either from verified JWT or demo mode)
export function getUserId(req: Request): string {
  const user = (req as any).user
  return user?.id || 'demo-user'
}

// Middleware for routes that need authentication but allow demo mode
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Allow explicit demo mode via header
  const allowDemo = process.env.DEMO_MODE === '1' || process.env.VITE_DEMO_MODE === '1' || req.app?.get('env') === 'development'
  if (allowDemo && req.headers['x-demo-mode'] === 'true') {
    ;(req as any).user = { id: 'demo-user' }
    return next()
  }

  // In development, accept the dev user injected by middleware
  const isDevEnv = process.env.NODE_ENV === 'development' || req.app?.get('env') === 'development'
  if (isDevEnv && (req as any).user?.id) {
    // In dev, accept the injected dev user without requiring DB
    return next()
  }

  // Otherwise require a valid Bearer token
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  return verifySupabaseToken(req, res, next)
}
