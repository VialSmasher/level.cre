import { Request, Response, NextFunction } from 'express'
// storage import intentionally omitted in dev/demo to avoid DB calls in restricted environments
import { jwtVerify, JWTPayload } from 'jose'

// Verify JWT using Supabase shared secret (HS256)
async function verifyBearerJWT(token: string): Promise<JWTPayload | null> {
  try {
    const secret = process.env.SUPABASE_JWT_SECRET
    if (!secret) {
      console.error('JWT verify failed: SUPABASE_JWT_SECRET is not set')
      return null
    }

    const issuer = (() => {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
      if (!supabaseUrl) return undefined
      return supabaseUrl.replace(/\/$/, '') + '/auth/v1'
    })()

    const secretKey = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, secretKey, {
      issuer, // optional issuer check if env present
      algorithms: ['HS256'],
      // audience optional; Supabase uses aud: 'authenticated'
    })
    return payload
  } catch (err) {
    console.error('JWT verify failed (HS256):', (err as Error).message)
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
