import { Request, Response, NextFunction } from 'express'
// storage import intentionally omitted in dev/demo to avoid DB calls in restricted environments
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose'

let supabaseRemoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getSupabaseIssuer() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  if (!supabaseUrl) return undefined
  return supabaseUrl.replace(/\/$/, '') + '/auth/v1'
}

// Verify JWT using Supabase shared secret (HS256)
async function verifyBearerJWT(token: string): Promise<JWTPayload | null> {
  const issuer = getSupabaseIssuer()
  const secret = process.env.SUPABASE_JWT_SECRET

  if (secret) {
    const secretKey = new TextEncoder().encode(secret)
    try {
      const { payload } = await jwtVerify(token, secretKey, {
        issuer, // optional issuer check if env present
        algorithms: ['HS256'],
        // audience optional; Supabase uses aud: 'authenticated'
      })
      return payload
    } catch (err) {
      // Fresh Supabase projects may sign access tokens with asymmetric JWT keys.
      // Fall through to JWKS verification when a project URL is configured.
      console.warn('JWT verify failed (HS256), trying JWKS if configured:', (err as Error).message)
    }
  }

  if (!issuer) {
    console.error('JWT verify failed: Supabase URL is not set')
    return null
  }

  try {
    supabaseRemoteJwks ??= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    const { payload } = await jwtVerify(token, supabaseRemoteJwks, {
      issuer,
      algorithms: ['ES256', 'RS256'],
    })
    return payload
  } catch (err) {
    console.error('JWT verify failed (JWKS):', (err as Error).message)
    return null
  }
}

export async function getUserFromBearerAuthHeader(authHeader?: string): Promise<{ id: string; email?: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const payload = await verifyBearerJWT(token)
  if (!payload || !payload.sub) return null
  return {
    id: payload.sub,
    email: (payload as any).email,
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

  // Prefer a real bearer token when present, even in development.
  // The dev user should only be a fallback for truly unauthenticated local requests.
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return verifySupabaseToken(req, res, next)
  }

  // In development, accept the synthetic dev user only when no real auth was supplied.
  const isDevEnv = process.env.NODE_ENV === 'development' || req.app?.get('env') === 'development'
  if (isDevEnv && (req as any).user?.id) {
    return next()
  }

  return res.status(401).json({ message: 'Authentication required' })
}
