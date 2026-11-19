import { z } from 'zod';
const text = (length: number) => z.string().trim().max(length).default('');
const url = z.union([z.literal(''), z.string().url().max(2000).refine(value => {
        try {
            const parsed = new URL(value);
            return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
        }
        catch {
            return false;
        }
    }, 'Use an HTTPS link.')]).default('');
export const BrokerSchema = z.object({
    name: z.string().trim().min(1).max(240),
    firm: z.string().trim().min(1).max(240),
    office: text(240),
    email: z.union([z.literal(''), z.string().trim().email().max(320)]).default(''),
    phone: text(80),
    linkedinUrl: url.refine(value => {
        try {
            return !value || /(^|\.)linkedin\.com$/i.test(new URL(value).hostname);
        }
        catch {
            return false;
        }
    }, 'Use a LinkedIn profile URL.'),
    sourceUrl: url, notes: text(4000),
    version: z.number().int().min(0), archived: z.boolean().default(false),
}).strict();
export const RelationshipSchema = z.object({
    brokerId: z.string().uuid(), prospectId: z.string().min(1).max(240),
    status: z.enum(['unverified', 'active', 'historical', 'ended']),
    scope: text(500), notes: text(4000), sourceUrl: url,
    learnedOn: z.string().date(), version: z.number().int().min(0),
    archived: z.boolean().default(false),
}).strict();
