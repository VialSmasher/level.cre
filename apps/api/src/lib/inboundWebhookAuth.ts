import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

// Recipient and mailbox fields are routing data, never credentials.
export function inboundWebhookAuthorized(req: Pick<Request, 'headers'> & { query?: Record<string, unknown> }, expected: string, options: { allowQuerySecret?: boolean } = {}): boolean {
  if (!expected) return false
  const candidates = [String(req.headers['x-levelcre-inbound-secret'] || '')]
  if (options.allowQuerySecret && typeof req.query?.secret === 'string') candidates.push(req.query.secret)
  const authorization = String(req.headers.authorization || '')
  if (/^Bearer\s+/i.test(authorization)) candidates.push(authorization.replace(/^Bearer\s+/i, '').trim())
  if (/^Basic\s+/i.test(authorization)) {
    const decoded = Buffer.from(authorization.replace(/^Basic\s+/i, ''), 'base64').toString('utf8')
    const separator = decoded.indexOf(':')
    // Postmark HTTPS Basic auth: accept the configured secret as the password.
    if (separator >= 0) candidates.push(decoded.slice(separator + 1))
  }
  const expectedBytes = Buffer.from(expected)
  return candidates.some(value => {
    const actual = Buffer.from(value)
    return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes)
  })
}
