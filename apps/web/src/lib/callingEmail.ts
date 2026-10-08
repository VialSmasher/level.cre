import { z } from 'zod'

const savedEmail = z.string().trim().max(320).email()

/** Open one saved recipient only; composing is separate from verified sending. */
export function callingEmailLink(value: string | null | undefined): { email: string; href: string } | null {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return null
  const parsed = savedEmail.safeParse(value)
  if (!parsed.success) return null
  const recipient = encodeURIComponent(parsed.data).replace(/%40/g, '@').replace(/[!'()*]/g, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase())
  return { email: parsed.data, href: 'mailto:' + recipient }
}
