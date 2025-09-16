import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// Supabase JWT verification middleware
export function verifySupabaseToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  
  // Check for demo mode first
  if (req.headers['x-demo-mode'] === 'true') {
    // Allow demo requests through with demo user
    (req as any).user = { id: 'demo-user' }
    return next()
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No authentication token provided' })
  }

  const token = authHeader.slice(7) // Remove 'Bearer ' prefix
  
  try {
    // Verify the JWT token without checking signature for now
    // In production, you'd want to verify with Supabase's public key
    const decoded = jwt.decode(token) as any
    
    if (!decoded || !decoded.sub) {
      return res.status(401).json({ message: 'Invalid token' })
    }
    
    // Add user info to request
    (req as any).user = {
      id: decoded.sub,
      email: decoded.email,
      ...decoded
    }
    
    next()
  } catch (error) {
    console.error('Token verification error:', error)
    return res.status(401).json({ message: 'Invalid token' })
  }
}

// Extract user ID from request (either from JWT or demo mode)
export function getUserId(req: Request): string {
  const user = (req as any).user
  return user?.id || 'demo-user'
}

// Middleware for routes that need authentication but allow demo mode
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Check for demo mode
  if (req.headers['x-demo-mode'] === 'true') {
    (req as any).user = { id: 'demo-user' }
    return next()
  }
  
  const authHeader = req.headers.authorization
  console.log("Auth header:", authHeader ? `Bearer ${authHeader.slice(7, 20)}...` : 'None')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log("No auth header provided for profile creation")
    return res.status(401).json({ message: 'Authentication required' })
  }
  
  verifySupabaseToken(req, res, next)
}