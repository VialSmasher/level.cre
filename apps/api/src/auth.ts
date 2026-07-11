import { Request, Response, NextFunction } from 'express'
// storage import intentionally omitted in dev/demo to avoid DB calls in restricted environments
import { jwtVerify, JWTPayload } from 'jose'
import { timingSafeEqual } from 'crypto'

function safeTokenEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function getConfiguredAgentUser(req: Request): { id: string; email?: string; agentName?: string } | null {
  const expectedToken = process.env.INTEL_AGENT_API_KEY
  const userId = process.env.INTEL_AGENT_USER_ID
  if (!expectedToken || !userId) return null

  const authHeader = req.headers.authorization
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const headerToken = typeof req.headers['x-levelcre-agent-key'] === 'string' ? req.headers['x-levelcre-agent-key'] : null
  const suppliedTokens = [bearerToken, headerToken].filter((token): token is string => Boolean(token))
  if (!suppliedTokens.some((token) => safeTokenEquals(token, expectedToken))) return null

  return {
    id: userId,
    email: process.env.INTEL_AGENT_EMAIL || undefined,
    agentName: process.env.INTEL_AGENT_NAME || 'levelcre-agent',
  }
}

function getConfiguredSalesActivityAgent(req: Request): { id: string; email?: string; agentName?: string } | null {
  const expectedToken = process.env.SALES_ACTIVITY_AGENT_API_KEY
  const userId = process.env.SALES_ACTIVITY_AGENT_USER_ID || process.env.INTEL_AGENT_USER_ID
  if (!expectedToken || !userId) return null

  const authHeader = req.headers.authorization
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const headerToken = typeof req.headers['x-levelcre-sales-key'] === 'string'
    ? req.headers['x-levelcre-sales-key']
    : null
  const suppliedTokens = [bearerToken, headerToken].filter((token): token is string => Boolean(token))
  if (!suppliedTokens.some((token) => safeTokenEquals(token, expectedToken))) return null

  return {
    id: userId,
    email: process.env.SALES_ACTIVITY_AGENT_EMAIL || process.env.INTEL_AGENT_EMAIL || undefined,
    agentName: process.env.SALES_ACTIVITY_AGENT_NAME || 'codex-sales-activity',
  }
}

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

  const agentUser = getConfiguredAgentUser(req)
  if (agentUser) {
    ;(req as any).user = {
      id: agentUser.id,
      email: agentUser.email,
      role: 'agent',
      agentName: agentUser.agentName,
    }
    return next()
  }

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
  const agentUser = getConfiguredAgentUser(req)
  if (agentUser) {
    ;(req as any).user = {
      id: agentUser.id,
      email: agentUser.email,
      role: 'agent',
      agentName: agentUser.agentName,
    }
    return next()
  }

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

export async function requireSalesActivityAuth(req: Request, res: Response, next: NextFunction) {
  const salesAgentUser = getConfiguredSalesActivityAgent(req)
  if (salesAgentUser) {
    ;(req as any).user = {
      id: salesAgentUser.id,
      email: salesAgentUser.email,
      role: 'sales_activity_agent',
      agentName: salesAgentUser.agentName,
    }
    return next()
  }

  return requireAuth(req, res, next)
}
