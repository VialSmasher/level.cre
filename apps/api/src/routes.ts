import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { ensureUser } from './ensureUser';
import { getUserId, requireAuth, getUserFromBearerAuthHeader } from "./auth";
import { z } from 'zod';
import { ProspectGeometry, ProspectStatus, FollowUpTimeframe } from '@level-cre/shared/schema';
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import * as demo from './demoStore';

function isDemo(req: Request): boolean {
  return req.headers['x-demo-mode'] === 'true' || process.env.VITE_DEMO_MODE === '1' || process.env.DEMO_MODE === '1';
}
import { createClient } from '@supabase/supabase-js';
import { pool, db } from './db';
import { listings, listingMembers, listingInvites, users, profiles, listingProspects, contactInteractions } from '@level-cre/shared/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { XP_VALUES, actionForInteractionType, xpForInteractionType } from './lib/gamification';
import { registerIndustrialIntelRoutes } from './modules/industrial-intel/registerRoutes';
import {
  buildDataQualityReview,
  buildFollowUpReview,
  type ToolAReviewInteraction,
  type ToolAReviewWorkspaceRef,
} from './lib/toolAReview';

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Supabase client for server-side OAuth
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey)
    : null;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const supabaseAdmin = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;
  const prospectSelect = 'id,user_id,name,status,notes,geometry,submarket_id,last_contact_date,follow_up_timeframe,follow_up_due_date,contact_name,contact_email,contact_phone,contact_company,size,acres,business_name,website_url,created_at,address,location_lat,location_lng';
  const listingSelect = 'id,user_id,title,address,lat,lng,submarket,deal_type,size,price,created_at,archived_at';

  function shouldUseSupabaseReadFallback(error: unknown): boolean {
    let current: any = error;
    while (current) {
      const code = String(current.code || '');
      const message = String(current.message || '');
      if (
        code === 'ENOTFOUND' ||
        code === 'ENETUNREACH' ||
        code === 'ECONNREFUSED' ||
        code === '42703' ||
        code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
        /ENOTFOUND|ENETUNREACH|ECONNREFUSED|self-signed certificate|column .* does not exist/i.test(message)
      ) {
        return true;
      }
      current = current.cause;
    }
    return false;
  }

  function normalizeInviteEmail(email: unknown): string {
    return String(email || '').trim().toLowerCase();
  }

  function isValidInviteEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function normalizeWorkspaceRole(role: unknown): 'editor' | 'viewer' {
    return role === 'editor' ? 'editor' : 'viewer';
  }

  function isPlaceholderProspectName(value?: string | null): boolean {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return true;
    return /^(new\s+(marker|point|polygon|rectangle|prospect)|new\s+\w+)$/.test(normalized);
  }

  function geometryFallbackName(geometry: unknown): string {
    const g = geometry as any;
    if (g?.type === 'Point' && Array.isArray(g.coordinates)) {
      const [lng, lat] = g.coordinates;
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return `Dropped pin (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`;
      }
    }
    if (g?.type === 'Polygon') return 'Mapped area';
    return 'Untitled Prospect';
  }

  function addDaysAtNoonUtc(anchor: Date, days: number): string {
    const date = new Date(anchor);
    date.setUTCDate(date.getUTCDate() + days);
    return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12,
      0,
      0,
    )).toISOString();
  }

  async function awardCapturedEmailActivity(userId: string, emailMessageId: string, isNewMessage: boolean) {
    if (!isNewMessage) return false;
    try {
      const existing = await pool.query(`
        SELECT id FROM public.skill_activities
        WHERE user_id = $1
          AND skill_type = 'followUp'
          AND action = $2
          AND related_id = $3
        LIMIT 1
      `, [userId, actionForInteractionType('email'), emailMessageId]);
      if (existing.rows[0]) return false;
      await storage.addSkillActivity({
        userId,
        skillType: 'followUp',
        action: actionForInteractionType('email'),
        xpGained: xpForInteractionType('email'),
        relatedId: emailMessageId,
        multiplier: 1,
      });
      return true;
    } catch (error) {
      console.warn('Captured email stored without XP activity credit', {
        userId,
        emailMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  function cleanProspectName(data: { name?: string | null; businessName?: string | null; contactCompany?: string | null; geometry?: unknown }): string {
    const business = data.businessName?.trim();
    const company = data.contactCompany?.trim();
    const name = data.name?.trim();
    if (business) return business;
    if (name && !isPlaceholderProspectName(name)) return name;
    if (company) return company;
    return geometryFallbackName(data.geometry);
  }

  function requireSupabaseAdmin() {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client is not configured');
    }
    return supabaseAdmin;
  }

  async function ensureListingInvitesTable(): Promise<void> {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.listing_invites (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
          listing_id varchar NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
          email varchar NOT NULL,
          role varchar NOT NULL DEFAULT 'viewer',
          invited_by varchar NOT NULL REFERENCES public.users(id),
          status varchar NOT NULL DEFAULT 'pending',
          email_delivery varchar DEFAULT 'not_configured',
          created_at timestamp DEFAULT now(),
          accepted_at timestamp
        );
      `);
      await pool.query(`ALTER TABLE public.listing_invites ADD COLUMN IF NOT EXISTS email_delivery varchar DEFAULT 'not_configured';`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "IDX_listing_invites_listing" ON public.listing_invites(listing_id);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "IDX_listing_invites_email" ON public.listing_invites(email);`);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_listing_invites_pending_email"
          ON public.listing_invites(listing_id, email)
          WHERE status = 'pending';
      `);
    } catch (error: any) {
      console.error('Failed to ensure listing_invites table:', error?.message || error);
    }
  }

  await ensureListingInvitesTable();

  async function ensureEmailIntegrationTables(): Promise<void> {
    try {
      const candidatePaths = [
        path.resolve(process.cwd(), 'drizzle/0012_email_review_queue.sql'),
        path.resolve(process.cwd(), '../../drizzle/0012_email_review_queue.sql'),
      ];
      const migrationPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
      if (!migrationPath) return;
      await pool.query(fs.readFileSync(migrationPath, 'utf8'));
    } catch (error: any) {
      console.error('Failed to ensure email integration tables:', error?.message || error);
    }
  }

  await ensureEmailIntegrationTables();

  const OUTLOOK_SCOPES = ['offline_access', 'User.Read', 'Mail.Read'];

  function getOutlookConfig(req?: Request) {
    const tenantId = process.env.OUTLOOK_TENANT_ID || process.env.MICROSOFT_TENANT_ID || 'common';
    const clientId = process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || '';
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || '';
    const configured = Boolean(clientId && clientSecret);
    const baseUrl =
      process.env.OUTLOOK_REDIRECT_BASE_URL ||
      process.env.EMAIL_OAUTH_REDIRECT_BASE_URL ||
      process.env.PUBLIC_APP_URL ||
      (req ? `${req.protocol}://${req.get('host')}` : '');
    const redirectUri = `${String(baseUrl).replace(/\/$/, '')}/api/email/outlook/callback`;
    return {
      tenantId,
      clientId,
      clientSecret,
      configured: configured && Boolean(baseUrl),
      redirectUri,
      authorizeUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    };
  }

  function getEmailTokenKey() {
    const raw =
      process.env.EMAIL_TOKEN_ENCRYPTION_KEY ||
      process.env.ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      process.env.SUPABASE_JWT_SECRET ||
      '';
    if (!raw) throw new Error('EMAIL_TOKEN_ENCRYPTION_KEY or JWT_SECRET must be set to store email tokens');
    return createHash('sha256').update(raw).digest();
  }

  function encryptJson(payload: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', getEmailTokenKey(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
  }

  function decryptJson<T = any>(ciphertext: string): T {
    const [ivText, tagText, encryptedText] = String(ciphertext || '').split('.');
    if (!ivText || !tagText || !encryptedText) throw new Error('Invalid encrypted token payload');
    const decipher = createDecipheriv('aes-256-gcm', getEmailTokenKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  }

  function signEmailState(payload: Record<string, unknown>) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'dev_change_me';
    const signature = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  function verifyEmailState(state: unknown): any {
    const [body, signature] = String(state || '').split('.');
    if (!body || !signature) throw new Error('Invalid OAuth state');
    const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'dev_change_me';
    const expected = createHmac('sha256', secret).update(body).digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new Error('Invalid OAuth state signature');
    }
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed?.userId || !parsed?.iat || Date.now() - Number(parsed.iat) > 10 * 60 * 1000) {
      throw new Error('Expired OAuth state');
    }
    return parsed;
  }

  async function exchangeOutlookCode(req: Request, code: string) {
    const config = getOutlookConfig(req);
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      scope: OUTLOOK_SCOPES.join(' '),
    });
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error_description || json.error || 'Outlook token exchange failed');
    return json;
  }

  async function refreshOutlookToken(connectionId: string, userId: string) {
    const { rows } = await pool.query(`
      SELECT token_ciphertext FROM public.email_connections
      WHERE id = $1 AND user_id = $2 AND provider = 'outlook'
    `, [connectionId, userId]);
    const connection = rows[0];
    if (!connection?.token_ciphertext) throw new Error('Outlook connection has no stored token');
    const tokens = decryptJson<any>(connection.token_ciphertext);
    if (tokens.access_token && tokens.expires_at && Number(tokens.expires_at) - Date.now() > 60_000) {
      return tokens.access_token as string;
    }
    if (!tokens.refresh_token) throw new Error('Outlook connection needs reauthorization');
    const config = getOutlookConfig();
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
      scope: OUTLOOK_SCOPES.join(' '),
    });
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error_description || json.error || 'Outlook token refresh failed');
    const nextTokens = {
      ...tokens,
      ...json,
      refresh_token: json.refresh_token || tokens.refresh_token,
      expires_at: Date.now() + Math.max(Number(json.expires_in || 3600) - 60, 60) * 1000,
    };
    await pool.query(`
      UPDATE public.email_connections
      SET token_ciphertext = $3, token_expires_at = $4, status = 'connected', error_message = NULL, updated_at = now()
      WHERE id = $1 AND user_id = $2
    `, [connectionId, userId, encryptJson(nextTokens), new Date(nextTokens.expires_at)]);
    return nextTokens.access_token as string;
  }

  async function graphGet(accessToken: string, url: string) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || json.error_description || 'Microsoft Graph request failed');
    return json;
  }

  async function storeInboundEmailForReview(userId: string, messageData: any) {
    const inserted = await pool.query(`
      INSERT INTO public.email_messages (
        user_id, connection_id, provider, provider_message_id, provider_thread_id, mailbox, direction,
        subject, sender_email, sender_name, recipient_emails, cc_emails, sent_at, received_at,
        snippet, attachment_names, source_url, raw_metadata, updated_at
      )
      VALUES (
        $1::varchar,
        NULL,
        $2::varchar,
        $3::varchar,
        $4::varchar,
        $5::varchar,
        $6::varchar,
        $7::text,
        $8::varchar,
        $9::varchar,
        $10::varchar[],
        $11::varchar[],
        $12::timestamp,
        $13::timestamp,
        $14::text,
        $15::varchar[],
        $16::text,
        $17::jsonb,
        now()
      )
      ON CONFLICT (user_id, provider, provider_message_id)
      DO UPDATE SET
        provider_thread_id = EXCLUDED.provider_thread_id,
        mailbox = EXCLUDED.mailbox,
        direction = EXCLUDED.direction,
        subject = EXCLUDED.subject,
        sender_email = EXCLUDED.sender_email,
        sender_name = EXCLUDED.sender_name,
        recipient_emails = EXCLUDED.recipient_emails,
        cc_emails = EXCLUDED.cc_emails,
        sent_at = EXCLUDED.sent_at,
        received_at = EXCLUDED.received_at,
        snippet = EXCLUDED.snippet,
        attachment_names = EXCLUDED.attachment_names,
        source_url = EXCLUDED.source_url,
        raw_metadata = EXCLUDED.raw_metadata,
        updated_at = now()
      RETURNING id, (xmax = 0) AS inserted
    `, [
      userId,
      messageData.provider,
      messageData.providerMessageId,
      messageData.providerThreadId,
      messageData.mailbox,
      messageData.direction,
      messageData.subject,
      messageData.senderEmail,
      messageData.senderName,
      messageData.recipientEmails,
      messageData.ccEmails,
      messageData.sentAt,
      messageData.receivedAt,
      messageData.snippet,
      messageData.attachmentNames,
      messageData.sourceUrl,
      JSON.stringify(messageData.rawMetadata || {}),
    ]);
    const emailMessageId = inserted.rows[0].id;
    const isNewMessage = Boolean(inserted.rows[0]?.inserted);
    const xpAwarded = await awardCapturedEmailActivity(userId, emailMessageId, isNewMessage);
    let matchesCreated = 0;
    const result = await pool.query(`
      INSERT INTO public.email_prospect_matches (
        user_id, email_message_id, prospect_id, confidence, match_status, match_reason,
        suggested_interaction_type, suggested_outcome, suggested_summary, updated_at
      )
      SELECT $1::varchar, $2::varchar, NULL, 0, 'needs_context', $3::text, 'email', 'contacted', $4::text, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.email_prospect_matches
        WHERE user_id = $1::varchar AND email_message_id = $2::varchar AND prospect_id IS NULL
      )
      RETURNING id
    `, [
      userId,
      emailMessageId,
      'Captured email activity; no automatic prospect matching.',
      [messageData.subject, messageData.snippet].filter(Boolean).join('\n').slice(0, 1000),
    ]);
    if (result.rows[0]) matchesCreated += 1;
    return { emailMessageId, inserted: isNewMessage, matchesCreated, xpAwarded, newXpGained: xpAwarded ? xpForInteractionType('email') : 0 };
  }

  function getInboundWebhookSecret() {
    return process.env.EMAIL_INBOUND_WEBHOOK_SECRET || process.env.INBOUND_EMAIL_WEBHOOK_SECRET || '';
  }

  function isInboundRequestAuthorized(req: Request) {
    const expected = getInboundWebhookSecret();
    if (!expected) return false;
    const candidates: string[] = [];
    const supplied = String(req.headers['x-levelcre-inbound-secret'] || '').trim();
    if (supplied) candidates.push(supplied);
    const authorization = String(req.headers.authorization || '').trim();
    if (/^Bearer\s+/i.test(authorization)) {
      candidates.push(authorization.replace(/^Bearer\s+/i, '').trim());
    } else if (/^Basic\s+/i.test(authorization)) {
      try {
        const decoded = Buffer.from(authorization.replace(/^Basic\s+/i, '').trim(), 'base64').toString('utf8');
        const separatorIndex = decoded.indexOf(':');
        if (decoded) candidates.push(decoded);
        if (separatorIndex >= 0) {
          const username = decoded.slice(0, separatorIndex).trim();
          const password = decoded.slice(separatorIndex + 1).trim();
          if (username) candidates.push(username);
          if (password) candidates.push(password);
        }
      } catch {
        // Ignore malformed Basic auth headers and continue checking other auth methods.
      }
    }
    const querySecret = String(req.query.secret || '').trim();
    if (querySecret) candidates.push(querySecret);
    const expectedBuffer = Buffer.from(expected);
    return candidates.some((candidate) => {
      const actualBuffer = Buffer.from(candidate);
      return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
    });
  }

  function isRecipientVerifiedInboundPayload(payload: any) {
    const recipients = getInboundRecipientEmails(payload);
    if (recipients.some((email) => isConfiguredInboundAddress(email))) return true;

    const mailboxHash = pickString(payload, ['MailboxHash', 'mailboxHash']).toLowerCase();
    if (!mailboxHash) return false;
    const configuredAddress = String(process.env.EMAIL_INBOUND_ADDRESS || process.env.INBOUND_EMAIL_ADDRESS || '').trim().toLowerCase();
    const configuredLocalPart = configuredAddress.split('@')[0] || '';
    return Boolean(configuredLocalPart && configuredLocalPart === mailboxHash);
  }

  function parseEmailAddresses(value: unknown): string[] {
    const text = Array.isArray(value) ? value.join(',') : String(value || '');
    return Array.from(new Set(text
      .split(/[;,]/)
      .map((part) => {
        const match = part.match(/<([^>]+)>/);
        return (match?.[1] || part).trim().toLowerCase();
      })
      .filter((part) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part))));
  }

  function parseGraphRecipientEmails(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.flatMap((recipient: any) => {
      const address = String(recipient?.emailAddress?.address || '').trim().toLowerCase();
      const nameEmails = parseEmailAddresses(recipient?.emailAddress?.name);
      return [address, ...nameEmails].filter((part) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part));
    })));
  }

  function parsePostmarkAddressList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value
      .map((item: any) => String(item?.Email || item?.email || '').trim().toLowerCase())
      .filter((part) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part))));
  }

  function getInboundRecipientEmails(payload: any): string[] {
    return Array.from(new Set([
      ...parseEmailAddresses(payload?.to || payload?.To || payload?.recipient || payload?.Recipients),
      ...parseEmailAddresses(payload?.cc || payload?.Cc),
      ...parseEmailAddresses(payload?.bcc || payload?.Bcc),
      ...parseEmailAddresses(payload?.OriginalRecipient || payload?.originalRecipient),
      ...parsePostmarkAddressList(payload?.ToFull || payload?.toFull),
      ...parsePostmarkAddressList(payload?.CcFull || payload?.ccFull),
      ...parsePostmarkAddressList(payload?.BccFull || payload?.bccFull),
    ]));
  }

  function parseSender(value: unknown) {
    const text = String(value || '').trim();
    const match = text.match(/^(.*?)<([^>]+)>$/);
    if (match) return { name: match[1].replace(/^"|"$/g, '').trim(), email: match[2].trim().toLowerCase() };
    const email = parseEmailAddresses(text)[0] || '';
    return { name: '', email };
  }

  function pickString(source: any, keys: string[]) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return '';
  }

  function cleanInboundSnippet(value: string) {
    const normalized = String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/mailto:[^\s>]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return '';
    const signatureMarkers = [
      /\bassociate partner\b/i,
      /\bmain office:\b/i,
      /\bdirect:\b/i,
      /\bmobile:\b/i,
      /\bwww\./i,
    ];
    const cutoff = signatureMarkers
      .map((pattern) => normalized.search(pattern))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    const trimmed = cutoff !== undefined ? normalized.slice(0, cutoff).trim() : normalized;
    return trimmed.slice(0, 4000);
  }

  function getInboundAddressDomain(email: string) {
    const [, domain = ''] = String(email || '').toLowerCase().split('@');
    return domain;
  }

  function isConfiguredInboundAddress(email: string) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return false;
    const configuredAddress = String(process.env.EMAIL_INBOUND_ADDRESS || process.env.INBOUND_EMAIL_ADDRESS || '').trim().toLowerCase();
    if (configuredAddress && normalized === configuredAddress) return true;
    const configuredDomain = String(process.env.EMAIL_INBOUND_DOMAIN || process.env.INBOUND_EMAIL_DOMAIN || '').trim().toLowerCase();
    return Boolean(configuredDomain && getInboundAddressDomain(normalized) === configuredDomain);
  }

  function extractInboundUserToken(email: string) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !isConfiguredInboundAddress(normalized)) return '';
    const localPart = normalized.split('@')[0] || '';
    const plusToken = localPart.match(/\+([a-z0-9-]{20,})$/i)?.[1];
    if (plusToken) return plusToken;
    if (/^[a-z0-9-]{20,}$/i.test(localPart)) return localPart;
    return '';
  }

  async function findExistingInboundUserId(candidate: string) {
    const userId = String(candidate || '').trim();
    if (!userId) return '';
    const result = await pool.query(`SELECT id FROM public.users WHERE id = $1 LIMIT 1`, [userId]);
    return result.rows[0]?.id || '';
  }

  async function findInboundUserIdByEmail(email: string) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return '';
    try {
      const result = await pool.query(`
        SELECT id FROM public.users
        WHERE lower(email) = $1
        LIMIT 1
      `, [normalized]);
      if (result.rows[0]?.id) return result.rows[0].id;
    } catch (error) {
      console.warn('Inbound sender lookup against users failed', {
        email: normalized,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      const profileResult = await pool.query(`
        SELECT id FROM public.profiles
        WHERE lower(email) = $1
        LIMIT 1
      `, [normalized]);
      if (profileResult.rows[0]?.id) return profileResult.rows[0].id;
    } catch (error) {
      console.warn('Inbound sender lookup against profiles failed', {
        email: normalized,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      const connectionResult = await pool.query(`
        SELECT user_id AS id FROM public.email_connections
        WHERE provider = 'outlook'
          AND lower(email_address) = $1
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 1
      `, [normalized]);
      return connectionResult.rows[0]?.id || '';
    } catch (error) {
      console.warn('Inbound sender lookup against email_connections failed', {
        email: normalized,
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }

  async function findSoleConnectedOutlookUserId() {
    const result = await pool.query(`
      SELECT DISTINCT user_id AS id
      FROM public.email_connections
      WHERE provider = 'outlook'
        AND status = 'connected'
      LIMIT 2
    `);
    return result.rows.length === 1 ? result.rows[0].id : '';
  }

  async function findSoleLevelCreUserId() {
    const result = await pool.query(`
      SELECT id FROM public.users
      ORDER BY created_at ASC NULLS LAST
      LIMIT 2
    `);
    return result.rows.length === 1 ? result.rows[0].id : '';
  }

  async function resolveInboundUserId(payload: any) {
    const explicit = pickString(payload, ['userId', 'user_id', 'levelCreUserId']);
    if (explicit) return await findExistingInboundUserId(explicit);
    const mailboxHash = pickString(payload, ['MailboxHash', 'mailboxHash']);
    if (/^[a-z0-9-]{20,}$/i.test(mailboxHash)) {
      const mailboxUserId = await findExistingInboundUserId(mailboxHash);
      if (mailboxUserId) return mailboxUserId;
    }
    const recipients = getInboundRecipientEmails(payload);
    const tokens = recipients
      .map((email) => extractInboundUserToken(email))
      .filter(Boolean);
    for (const token of tokens) {
      const tokenUserId = await findExistingInboundUserId(token);
      if (tokenUserId) return tokenUserId;
    }
    const defaultUserId = process.env.EMAIL_INBOUND_DEFAULT_USER_ID || '';
    if (defaultUserId) {
      const defaultUser = await findExistingInboundUserId(defaultUserId);
      if (defaultUser) return defaultUser;
    }
    const from = parseSender(payload?.from || payload?.From || payload?.sender || payload?.Sender);
    const senderUserId = await findInboundUserIdByEmail(from.email);
    if (senderUserId) return senderUserId;
    if (isRecipientVerifiedInboundPayload(payload)) {
      const soleUserId = await findSoleLevelCreUserId();
      if (soleUserId) return soleUserId;
    }
    return await findSoleConnectedOutlookUserId();
  }

  function normalizeInboundPayload(payload: any, userId: string) {
    const from = parseSender(payload?.from || payload?.From || payload?.sender || payload?.Sender);
    const to = parseEmailAddresses(payload?.to || payload?.To || payload?.recipient || payload?.Recipients);
    const cc = parseEmailAddresses(payload?.cc || payload?.Cc);
    const bcc = parseEmailAddresses(payload?.bcc || payload?.Bcc);
    const inboundRecipients = getInboundRecipientEmails(payload);
    const subject = pickString(payload, ['subject', 'Subject']) || '(no subject)';
    const textBody = pickString(payload, ['text', 'TextBody', 'body-plain', 'stripped-text', 'plain', 'body']);
    const htmlBody = pickString(payload, ['html', 'HtmlBody', 'body-html', 'stripped-html']);
    const snippet = cleanInboundSnippet(textBody || htmlBody);
    const messageId = pickString(payload, ['messageId', 'MessageID', 'Message-Id', 'message-id', 'MessageId']);
    const dateText = pickString(payload, ['date', 'Date', 'timestamp']);
    const parsedDate = dateText ? new Date(/^\d+$/.test(dateText) ? Number(dateText) * 1000 : dateText) : new Date();
    const attachmentNames = Array.isArray(payload?.Attachments)
      ? payload.Attachments.map((item: any) => item?.Name || item?.name || item?.filename).filter(Boolean)
      : [];
    const fallbackId = createHash('sha256')
      .update([userId, from.email, subject, parsedDate.toISOString(), snippet.slice(0, 500)].join('|'))
      .digest('hex');
    return {
      provider: 'inbound',
      providerMessageId: messageId || fallbackId,
      providerThreadId: pickString(payload, ['threadId', 'ThreadID', 'conversationId']) || null,
      mailbox: 'inbound',
      direction: 'sent',
      subject,
      senderEmail: from.email,
      senderName: from.name,
      recipientEmails: to,
      ccEmails: cc,
      sentAt: parsedDate,
      receivedAt: new Date(),
      snippet,
      attachmentNames,
      sourceUrl: '',
      rawMetadata: {
        source: payload?.source || payload?.provider || 'inbound-webhook',
        inboundAddress: inboundRecipients.find((email) => extractInboundUserToken(email) === userId) || null,
        inboundRecipients,
        originalRecipient: pickString(payload, ['OriginalRecipient', 'originalRecipient']) || null,
        bccEmails: bcc,
        mailboxHash: pickString(payload, ['MailboxHash', 'mailboxHash']) || null,
      },
    };
  }

  function mapProspectRow(row: any) {
    const parsedSize = row.size !== null && row.size !== undefined && row.size !== ''
      ? Number(row.size)
      : undefined;
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      notes: row.notes || '',
      geometry: row.geometry,
      submarketId: row.submarket_id || undefined,
      lastContactDate: row.last_contact_date || undefined,
      followUpTimeframe: row.follow_up_timeframe || undefined,
      followUpDueDate: row.follow_up_due_date ? new Date(row.follow_up_due_date).toISOString() : undefined,
      contactName: row.contact_name || undefined,
      contactEmail: row.contact_email || undefined,
      contactPhone: row.contact_phone || undefined,
      contactCompany: row.contact_company || undefined,
      buildingSf: Number.isFinite(parsedSize as number) ? parsedSize : undefined,
      lotSizeAcres: row.acres !== null && row.acres !== undefined ? Number(row.acres) : undefined,
      aiMetadata: undefined,
      businessName: row.business_name || undefined,
      websiteUrl: row.website_url || undefined,
      createdDate: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }

  function mapListingRow(row: any) {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      submarket: row.submarket,
      dealType: row.deal_type,
      size: row.size,
      price: row.price,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    };
  }

  async function getAccessibleListingIdsViaSupabase(userId: string): Promise<string[]> {
    const admin = requireSupabaseAdmin();
    const [{ data: owned, error: ownedError }, { data: memberRows, error: memberError }] = await Promise.all([
      admin.from('listings').select('id').eq('user_id', userId),
      admin.from('listing_members').select('listing_id').eq('user_id', userId),
    ]);
    if (ownedError) throw ownedError;
    if (memberError) throw memberError;
    return Array.from(new Set([
      ...(owned || []).map((row: any) => row.id),
      ...(memberRows || []).map((row: any) => row.listing_id),
    ]));
  }

  async function getListingRoleViaSupabase(userId: string, listingId: string): Promise<'owner' | 'editor' | 'viewer' | null> {
    const admin = requireSupabaseAdmin();
    const { data: listing, error: listingError } = await admin
      .from('listings')
      .select('id,user_id')
      .eq('id', listingId)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing) return null;
    if (listing.user_id === userId) return 'owner';

    const { data: member, error: memberError } = await admin
      .from('listing_members')
      .select('role')
      .eq('listing_id', listingId)
      .eq('user_id', userId)
      .maybeSingle();
    if (memberError) throw memberError;
    return (member?.role as any) || null;
  }

  async function getListingsViaSupabase(userId: string, scope: 'owned' | 'shared'): Promise<any[]> {
    const admin = requireSupabaseAdmin();
    let listingRows: any[] = [];

    if (scope === 'shared') {
      const { data: memberRows, error: memberError } = await admin
        .from('listing_members')
        .select('listing_id')
        .eq('user_id', userId);
      if (memberError) throw memberError;
      const listingIds = Array.from(new Set((memberRows || []).map((row: any) => row.listing_id)));
      if (listingIds.length === 0) return [];
      const { data, error } = await admin
        .from('listings')
        .select(listingSelect)
        .in('id', listingIds)
        .is('archived_at', null);
      if (error) throw error;
      listingRows = data || [];
    } else {
      const { data, error } = await admin
        .from('listings')
        .select(listingSelect)
        .eq('user_id', userId)
        .is('archived_at', null);
      if (error) throw error;
      listingRows = data || [];
    }

    const listingIds = listingRows.map((row: any) => row.id);
    const countByListingId = new Map<string, number>();
    if (listingIds.length > 0) {
      const { data: linkedRows, error: linkedError } = await admin
        .from('listing_prospects')
        .select('listing_id')
        .in('listing_id', listingIds);
      if (linkedError) throw linkedError;
      for (const row of linkedRows || []) {
        countByListingId.set(row.listing_id, (countByListingId.get(row.listing_id) || 0) + 1);
      }
    }

    return listingRows.map((row: any) => ({
      ...mapListingRow(row),
      prospectCount: countByListingId.get(row.id) || 0,
    }));
  }

  async function getListingViaSupabase(listingId: string): Promise<any | null> {
    const admin = requireSupabaseAdmin();
    const { data, error } = await admin
      .from('listings')
      .select(listingSelect)
      .eq('id', listingId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapListingRow(data) : null;
  }

  async function getListingProspectsViaSupabase(listingId: string): Promise<any[]> {
    const admin = requireSupabaseAdmin();
    const { data: links, error: linksError } = await admin
      .from('listing_prospects')
      .select('prospect_id')
      .eq('listing_id', listingId);
    if (linksError) throw linksError;
    const prospectIds = Array.from(new Set((links || []).map((row: any) => row.prospect_id)));
    if (prospectIds.length === 0) return [];

    const { data, error } = await admin
      .from('prospects')
      .select(prospectSelect)
      .in('id', prospectIds);
    if (error) throw error;
    return (data || []).map(mapProspectRow);
  }

  async function getAllProspectsViaSupabase(userId: string): Promise<any[]> {
    const admin = requireSupabaseAdmin();
    const { data: ownRows, error: ownError } = await admin
      .from('prospects')
      .select(prospectSelect)
      .eq('user_id', userId);
    if (ownError) throw ownError;

    const accessibleListingIds = await getAccessibleListingIdsViaSupabase(userId);
    const deduped = new Map<string, any>();
    for (const row of ownRows || []) {
      deduped.set(row.id, mapProspectRow(row));
    }

    if (accessibleListingIds.length > 0) {
      const { data: linkRows, error: linkError } = await admin
        .from('listing_prospects')
        .select('prospect_id')
        .in('listing_id', accessibleListingIds);
      if (linkError) throw linkError;

      const sharedProspectIds = Array.from(new Set((linkRows || []).map((row: any) => row.prospect_id)));
      if (sharedProspectIds.length > 0) {
        const { data: sharedRows, error: sharedError } = await admin
          .from('prospects')
          .select(prospectSelect)
          .in('id', sharedProspectIds);
        if (sharedError) throw sharedError;
        for (const row of sharedRows || []) {
          if (!deduped.has(row.id)) {
            deduped.set(row.id, mapProspectRow(row));
          }
        }
      }
    }

    return Array.from(deduped.values());
  }

  async function checkGoogleOAuthProvider(): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, message: 'Google sign-in is not configured for this environment.' };
    }

    try {
      const authorizeUrl = new URL('/auth/v1/authorize', supabaseUrl);
      authorizeUrl.searchParams.set('provider', 'google');
      authorizeUrl.searchParams.set('redirect_to', 'https://example.com/auth/callback');
      authorizeUrl.searchParams.set('apikey', supabaseKey);

      const response = await fetch(authorizeUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
      });

      if (response.status >= 500) {
        return { ok: false, message: 'Google sign-in is temporarily unavailable. Please try again in a few minutes.' };
      }

      if (response.status >= 400) {
        return { ok: false, message: 'Google sign-in is currently unavailable. Please use Demo Mode and try again later.' };
      }

      return { ok: true };
    } catch (error: any) {
      console.error('Google OAuth provider check failed:', error?.message || error);
      return { ok: false, message: 'Google sign-in provider is unreachable right now. Please use Demo Mode and try again later.' };
    }
  }

  // Helpers: membership + role checks
  async function getListingRole(userId: string, listingId: string): Promise<'owner' | 'editor' | 'viewer' | null> {
    try {
      // Owner check
      const [row] = await db.select().from(listings).where(eq(listings.id, listingId));
      if (!row) return null;
      if (row.userId === userId) return 'owner';
      const [member] = await db.select().from(listingMembers).where(and(eq(listingMembers.listingId, listingId), eq(listingMembers.userId, userId)));
      return (member?.role as any) || null;
    } catch (error) {
      if (!shouldUseSupabaseReadFallback(error) || !supabaseAdmin) {
        return null;
      }
      try {
        return await getListingRoleViaSupabase(userId, listingId);
      } catch {
        return null;
      }
    }
  }

  async function resolveEmailByUserIdViaSupabase(userId: string): Promise<string | null> {
    const admin = requireSupabaseAdmin();
    const { data: userRow, error: userError } = await admin
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    if (userError) throw userError;
    if (userRow?.email) return userRow.email;

    const { data: profileRow, error: profileError } = await admin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;
    return profileRow?.email || null;
  }

  async function getListingMembersViaSupabase(listingId: string): Promise<any[]> {
    const admin = requireSupabaseAdmin();
    const { data: listing, error: listingError } = await admin
      .from('listings')
      .select('user_id')
      .eq('id', listingId)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing) return [];

    const { data: members, error: membersError } = await admin
      .from('listing_members')
      .select('user_id,role')
      .eq('listing_id', listingId);
    if (membersError) throw membersError;

    const result: any[] = [{
      userId: listing.user_id,
      role: 'owner',
      email: await resolveEmailByUserIdViaSupabase(listing.user_id),
    }];

    for (const member of members || []) {
      if (member.user_id === listing.user_id) continue;
      result.push({
        userId: member.user_id,
        role: member.role,
        email: await resolveEmailByUserIdViaSupabase(member.user_id),
      });
    }

    const { data: invites, error: invitesError } = await admin
      .from('listing_invites')
      .select('id,email,role,status,email_delivery,created_at')
      .eq('listing_id', listingId)
      .eq('status', 'pending');
    if (invitesError) throw invitesError;

    for (const invite of invites || []) {
      result.push({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        emailDelivery: invite.email_delivery,
        createdAt: invite.created_at,
        kind: 'invite',
      });
    }

    return result;
  }

  async function acceptPendingListingInvites(userId: string, email?: string | null): Promise<number> {
    const normalized = normalizeInviteEmail(email);
    if (!normalized) return 0;

    const pending = await db
      .select()
      .from(listingInvites)
      .where(and(eq(listingInvites.email, normalized), eq(listingInvites.status, 'pending')));

    let accepted = 0;
    for (const invite of pending) {
      const [listing] = await db.select().from(listings).where(eq(listings.id, invite.listingId));
      if (!listing || listing.userId === userId) {
        await db
          .update(listingInvites)
          .set({ status: 'accepted', acceptedAt: new Date() })
          .where(eq(listingInvites.id, invite.id));
        continue;
      }

      await db
        .insert(listingMembers)
        .values({ listingId: invite.listingId, userId, role: normalizeWorkspaceRole(invite.role) })
        .onConflictDoUpdate({
          target: [listingMembers.listingId, listingMembers.userId],
          set: { role: normalizeWorkspaceRole(invite.role) },
        });

      await db
        .update(listingInvites)
        .set({ status: 'accepted', acceptedAt: new Date() })
        .where(eq(listingInvites.id, invite.id));
      accepted += 1;
    }

    return accepted;
  }

  function getPrimaryAppOrigin(req: Request): string | null {
    const originCandidates = (process.env.APP_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .filter((origin) => !origin.includes('*'));
    if (originCandidates[0]) return originCandidates[0].replace(/\/$/, '');

    const host = req.get('host') || '';
    if (!host) return null;
    const inferredProtocol = (host.includes('replit.app') || host.includes('replit.dev')) ? 'https' : req.protocol;
    return `${inferredProtocol}://${host}`;
  }

  async function sendWorkspaceInviteEmail(req: Request, email: string): Promise<'sent' | 'not_configured' | 'failed'> {
    if (!supabaseAdmin) return 'not_configured';
    const appOrigin = getPrimaryAppOrigin(req);
    const redirectTo = appOrigin ? `${appOrigin}/auth/callback` : undefined;
    try {
      const { error } = await (supabaseAdmin as any).auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
      if (error) {
        console.warn('Supabase invite email failed:', error?.message || error);
        return 'failed';
      }
      return 'sent';
    } catch (error: any) {
      console.warn('Supabase invite email failed:', error?.message || error);
      return 'failed';
    }
  }

  async function requireViewAccess(req: Request, listingId: string): Promise<'owner' | 'editor' | 'viewer'> {
    const userId = getUserId(req);
    if (isDemo(req)) {
      // Demo: owner if found under caller, else check membership store
      const owned = await demo.getListing(userId, listingId);
      if (owned) return 'owner';
      const role = await demo.getListingMemberRole(listingId, userId);
      if (role) return role as any;
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    const role = await getListingRole(userId, listingId);
    if (!role) throw Object.assign(new Error('Forbidden'), { status: 403 });
    return role;
  }

  async function requireEditAccess(req: Request, listingId: string): Promise<'owner' | 'editor'> {
    const role = await requireViewAccess(req, listingId);
    if (role === 'owner' || role === 'editor') return role;
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  async function requireOwnerAccess(req: Request, listingId: string): Promise<'owner'> {
    const role = await requireViewAccess(req, listingId);
    if (role === 'owner') return 'owner';
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  function parsePositiveIntParam(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  async function getToolAReviewProspects(req: Request, listingId?: string): Promise<any[]> {
    const userId = getUserId(req);

    if (isDemo(req)) {
      if (!listingId) {
        return await demo.getProspects(userId);
      }

      await requireViewAccess(req, listingId);
      const links = await demo.getListingLinksAll(listingId);
      const prospectIds = Array.from(new Set(links.map((link) => link.prospectId)));
      const prospects = await Promise.all(prospectIds.map((prospectId) => demo.getProspectAny(prospectId)));
      return prospects.filter((prospect): prospect is any => Boolean(prospect));
    }

    if (listingId) {
      await requireViewAccess(req, listingId);
      return await storage.getListingProspectsAny(listingId);
    }

    return await storage.getAllProspects(userId);
  }

  async function getToolAReviewInteractions(req: Request, prospectIds: string[]): Promise<ToolAReviewInteraction[]> {
    const userId = getUserId(req);
    if (prospectIds.length === 0) return [];

    if (isDemo(req)) {
      return await demo.getInteractionsForProspectsAny(prospectIds);
    }

    const rows = await db
      .select({
        id: contactInteractions.id,
        prospectId: contactInteractions.prospectId,
        userId: contactInteractions.userId,
        listingId: contactInteractions.listingId,
        date: contactInteractions.date,
        type: contactInteractions.type,
        outcome: contactInteractions.outcome,
        notes: contactInteractions.notes,
        nextFollowUp: contactInteractions.nextFollowUp,
        createdAt: contactInteractions.createdAt,
      })
      .from(contactInteractions)
      .where(inArray(contactInteractions.prospectId, prospectIds));

    return rows.map((row) => ({
      id: row.id,
      prospectId: row.prospectId,
      userId: row.userId,
      listingId: row.listingId,
      date: row.date,
      type: row.type,
      outcome: row.outcome,
      notes: row.notes,
      nextFollowUp: row.nextFollowUp,
      createdAt: row.createdAt?.toISOString() ?? null,
    }));
  }

  async function getToolAReviewWorkspaces(
    req: Request,
    prospectIds: string[],
    listingId?: string,
  ): Promise<Record<string, ToolAReviewWorkspaceRef[]>> {
    const userId = getUserId(req);
    const workspaceMap: Record<string, ToolAReviewWorkspaceRef[]> = {};

    if (prospectIds.length === 0) return workspaceMap;

    if (listingId) {
      if (isDemo(req)) {
        const listing = await demo.getListingAny(listingId);
        const links = await demo.getListingLinksAll(listingId);
        for (const link of links) {
          workspaceMap[link.prospectId] = [
            {
              id: listingId,
              title: listing?.title ?? null,
            },
          ];
        }
        return workspaceMap;
      }

      const listing = await storage.getListingAny(listingId);
      for (const prospectId of prospectIds) {
        workspaceMap[prospectId] = [
          {
            id: listingId,
            title: listing?.title ?? null,
          },
        ];
      }
      return workspaceMap;
    }

    if (isDemo(req)) {
      return workspaceMap;
    }

    const rows = await db
      .select({
        prospectId: listingProspects.prospectId,
        listingId: listings.id,
        listingTitle: listings.title,
      })
      .from(listingProspects)
      .innerJoin(listings, eq(listingProspects.listingId, listings.id))
      .leftJoin(
        listingMembers,
        and(eq(listingMembers.listingId, listings.id), eq(listingMembers.userId, userId)),
      )
      .where(
        and(
          inArray(listingProspects.prospectId, prospectIds),
          or(eq(listings.userId, userId), eq(listingMembers.userId, userId)),
        ),
      );

    for (const row of rows) {
      const list = workspaceMap[row.prospectId] ?? [];
      list.push({ id: row.listingId, title: row.listingTitle });
      workspaceMap[row.prospectId] = list;
    }

    return workspaceMap;
  }

  // Helper: find userId by email using Supabase Admin if available, else local tables
  async function findUserIdByEmail(email: string): Promise<{ id: string, email: string } | null> {
    const normalized = normalizeInviteEmail(email);
    if (!normalized) return null;
    if (isDemo({ headers: {} } as any)) {
      if (normalized === 'demo@example.com') return { id: 'demo-user', email: 'demo@example.com' };
      return null;
    }
    try {
      // Prefer users table
      const [u] = await db.select().from(users).where(eq(users.email, normalized));
      if (u) return { id: u.id, email: u.email || normalized } as any;
    } catch {}
    try {
      const [p] = await db.select().from(profiles).where(eq(profiles.email, normalized));
      if (p) return { id: p.id, email: p.email || normalized } as any;
    } catch {}
    try {
      if (supabaseAdmin) {
        // @ts-ignore - admin API types may vary
        const { data, error } = await (supabaseAdmin as any).auth.admin.getUserByEmail(normalized);
        if (!error && data?.user) {
          return { id: data.user.id, email: data.user.email || normalized };
        }
      }
    } catch {}
    return null;
  }

  // Helper: resolve a user's email by id via local tables, then Supabase admin if necessary
  async function resolveEmailByUserId(userId: string): Promise<string | null> {
    try {
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (u?.email) return u.email;
    } catch {}
    try {
      const [p] = await db.select().from(profiles).where(eq(profiles.id, userId));
      if (p?.email) return p.email as any;
    } catch {}
    try {
      if (supabaseAdmin) {
        // @ts-ignore admin API
        const { data, error } = await (supabaseAdmin as any).auth.admin.getUserById(userId);
        if (!error && data?.user) return data.user.email || null;
      }
    } catch {}
    return null;
  }

  const GOOGLE_ENABLED = (process.env.VITE_ENABLE_GOOGLE_AUTH === '1' || process.env.VITE_ENABLE_GOOGLE_AUTH === 'true');

  // Lightweight health + readiness probe
  app.get('/api/health', async (_req, res) => {
    try {
      const postgisRes: any = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='postgis') AS present`);
      const sridRes: any = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_prospects_geometry_srid_4326') AS present`);
      const postgis = Boolean((postgisRes?.rows?.[0] || postgisRes?.[0])?.present);
      const srid4326Enforced = Boolean((sridRes?.rows?.[0] || sridRes?.[0])?.present);
      return res.json({ ok: true, postgis, srid4326Enforced });
    } catch (err) {
      const e: any = err;
      console.error('Health check failed:', { message: e?.message, code: e?.code });
      return res.status(500).json({ ok: false, error: e?.message || 'health failed' });
    }
  });

  if (GOOGLE_ENABLED) {
    app.get('/api/auth/google/status', async (_req, res) => {
      const status = await checkGoogleOAuthProvider();
      if (!status.ok) return res.status(503).json(status);
      return res.json(status);
    });

    // Simple redirect to Google OAuth - let Supabase handle everything
    app.get('/api/auth/google', async (req, res) => {
      if (!supabase) {
        return res.status(500).json({ error: 'Supabase not configured' });
      }
      
      // Prefer an explicit, non-wildcard app origin for redirect if provided
      const originCandidates = (process.env.APP_ORIGIN || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const reqHost = (req.get('host') || '').toLowerCase();
      // Prefer an explicit origin that matches current host (if any)
      const appOrigin = originCandidates.find(o => {
        if (o.includes('*')) return false;
        try {
          const u = new URL(o);
          return reqHost === u.host.toLowerCase();
        } catch { return false }
      });
      // Fallback protocol inference for logs and building the URL
      const host = req.get('host') || '';
      const inferredProtocol = (host.includes('replit.app') || host.includes('replit.dev')) ? 'https' : req.protocol;
      let redirectUrl: string;
      if (appOrigin) {
        redirectUrl = `${appOrigin.replace(/\/$/, '')}/auth/callback`;
      } else {
        // Fallback to current host
        redirectUrl = `${inferredProtocol}://${host}/auth/callback`;
      }
      
      if (req.app.get('env') === 'development') {
        console.log('OAuth Debug - Host:', host);
        console.log('OAuth Debug - Protocol:', inferredProtocol);
        console.log('OAuth Debug - Redirect URL:', redirectUrl);
      }
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: { prompt: 'select_account', access_type: 'offline' },
        }
      });
      
      if (error) {
        console.error('OAuth initiation error:', error);
        return res.redirect(`/?error=${encodeURIComponent(error.message)}`);
      }
      
      if (req.app.get('env') === 'development') {
        console.log('OAuth Debug - Generated URL:', data.url);
      }
      
      if (data.url) {
        res.redirect(data.url);
      } else {
        res.redirect('/?error=no_oauth_url');
      }
    });
  } else {
    // Google OAuth disabled
    app.get('/api/auth/google', async (_req, res) => {
      return res.status(503).json({ error: 'Google OAuth is temporarily disabled' });
    });
  }

  // OAuth callback endpoint that Supabase/Google might hit (proxy -> client callback)
  app.get('/api/auth/callback', async (req, res) => {
    if (req.app.get('env') === 'development') {
      console.log('OAuth Callback - Query params:', req.query);
      console.log('OAuth Callback - Headers:', req.headers);
    }
    
    // Handle OAuth callback - redirect to client callback preserving query
    const { code, error: authError } = req.query;
    
    if (authError) {
      console.error('OAuth callback error:', authError);
      return res.redirect(`/?error=${encodeURIComponent(authError as string)}`);
    }
    
    // Redirect to client callback with original query string; client will exchange the code
    const appOrigin = process.env.APP_ORIGIN?.split(',')[0]?.trim();
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    if (appOrigin) {
      return res.redirect(`${appOrigin.replace(/\/$/, '')}/auth/callback${qs}`);
    }
    res.redirect(`/auth/callback${qs}`);
  });

  // Removed stateful session endpoint (stateless auth only)

  // Logout endpoint (stateless) – nothing to clear server-side
  app.post('/api/auth/logout', async (_req, res) => {
    res.json({ success: true });
  });

  // Basic email+password login removed in favor of Google OAuth
  
  // Demo: reset persisted demo data (safe no-op outside demo mode)
  app.post('/api/demo/reset', async (req, res) => {
    if (!isDemo(req)) return res.status(403).json({ ok: false, message: 'Not in demo mode' });
    try {
      await demo.reset();
      res.json({ ok: true });
    } catch (e: any) {
      console.error('Demo reset error:', e);
      res.status(500).json({ ok: false, message: e.message || 'Failed to reset demo data' });
    }
  });

  // Read-only diagnostics: /api/diag/summary
  app.get('/api/diag/summary', async (req, res) => {
    try {
      const flag = String(process.env.NEXT_PUBLIC_ADMIN_DIAG_ENABLED || '').toLowerCase();
      const diagEnabled = ['1','true','yes','on'].includes(flag);
      if (!diagEnabled) {
        return res.status(404).json({ message: 'Not found' });
      }

      // Helper: safe filesystem route detection (scan web router file)
      const routesState = (() => {
        try {
          const repoRoot = path.resolve(process.cwd(), '..', '..');
          const appRouterPath = path.join(repoRoot, 'apps', 'web', 'src', 'App.tsx');
          const src = fs.readFileSync(appRouterPath, 'utf8');
          return {
            brokerStats: src.includes('/broker-stats') || src.includes('broker-stats'),
            leaderboard: src.includes('/leaderboard') || src.includes('leaderboard'),
          };
        } catch {
          return { brokerStats: null as any, leaderboard: null as any };
        }
      })();

      // Helper: does a table exist?
      const tableExists = async (name: string): Promise<boolean> => {
        try {
          const { rows } = await pool.query(`SELECT to_regclass('public.' || $1) AS oid`, [name]);
          const oid = rows?.[0]?.oid;
          return Boolean(oid);
        } catch {
          return false;
        }
      };

      // Helper: does an index exist exactly by name?
      const indexExists = async (name: string): Promise<boolean> => {
        try {
          const { rows } = await pool.query(
            `SELECT EXISTS (
               SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1
             ) AS present`,
            [name]
          );
          return Boolean(rows?.[0]?.present);
        } catch {
          return false;
        }
      };

      // API existence (by source scan of API routes)
      const apisState = (() => {
        try {
          const apiRoutesPath = path.join(path.resolve(process.cwd(), '..', '..'), 'apps', 'api', 'src', 'routes.ts');
          const src = fs.readFileSync(apiRoutesPath, 'utf8');
          return {
            statsHeader: src.includes("/api/stats/header"),
          };
        } catch {
          return { statsHeader: null as any };
        }
      })();

      // DB table checks
      const hasEvents = await tableExists('events');
      const hasAssets = await tableExists('assets');

      // Index checks (only meaningful if events exists)
      const eventsIdxTypeCreatedAt = hasEvents
        ? await indexExists('events_user_type_created_at')
        : false;
      const eventsIdxUserAsset = hasEvents
        ? await indexExists('events_user_asset')
        : false;

      // Event types in last 90 days (safe fallback to empty)
      let eventTypes90d: Array<{ type: string; count: number }> = [];
      if (hasEvents) {
        try {
          const { rows } = await pool.query(
            `SELECT type, COUNT(*)::int AS count
             FROM events
             WHERE created_at >= NOW() - INTERVAL '90 days'
             GROUP BY type
             ORDER BY count DESC`
          );
          eventTypes90d = rows || [];
        } catch {
          eventTypes90d = [];
        }
      } else {
        // Try a best-effort fallback to contact_interactions if present
        const hasInteractions = await tableExists('contact_interactions');
        if (hasInteractions) {
          try {
            const { rows } = await pool.query(
              `SELECT type, COUNT(*)::int AS count
               FROM contact_interactions
               WHERE created_at >= NOW() - INTERVAL '90 days'
               GROUP BY type
               ORDER BY count DESC`
            );
            eventTypes90d = rows || [];
          } catch {
            eventTypes90d = [];
          }
        }
      }

      // Sample aggregations for current user (best-effort, read-only)
      const userId = getUserId(req);
      let assetsTracked: number | null = null;
      let followupsLogged: number | null = null;
      let lastActivityISO: string | null = null;

      if (hasEvents) {
        try {
          const assetRes = await pool.query(
            `SELECT COUNT(DISTINCT asset_id)::int AS c FROM events WHERE user_id = $1`,
            [userId]
          );
          assetsTracked = assetRes?.rows?.[0]?.c ?? 0;
        } catch {}
        try {
          const fuRes = await pool.query(
            `SELECT COUNT(*)::int AS c
             FROM events
             WHERE user_id = $1 AND type = ANY($2)`,
            [userId, ['call','email','meeting','followup_logged']]
          );
          followupsLogged = fuRes?.rows?.[0]?.c ?? 0;
        } catch {}
        try {
          const lastRes = await pool.query(
            `SELECT MAX(created_at) AS last FROM events WHERE user_id = $1`,
            [userId]
          );
          const last = lastRes?.rows?.[0]?.last as Date | null;
          lastActivityISO = last ? new Date(last).toISOString() : null;
        } catch {}
      } else {
        // Fallbacks for current schema
        try {
          const hasProspects = await tableExists('prospects');
          if (hasProspects) {
            const r = await pool.query(
              `SELECT COUNT(*)::int AS c FROM prospects WHERE user_id = $1`,
              [userId]
            );
            assetsTracked = r?.rows?.[0]?.c ?? 0;
          }
        } catch {}
        try {
          const hasInteractions = await tableExists('contact_interactions');
          if (hasInteractions) {
            const r = await pool.query(
              `SELECT COUNT(*)::int AS c
               FROM contact_interactions
               WHERE user_id = $1 AND type = ANY($2)`,
              [userId, ['call','email','meeting','followup_logged']]
            );
            followupsLogged = r?.rows?.[0]?.c ?? 0;
            const lastR = await pool.query(
              `SELECT MAX(created_at) AS last FROM contact_interactions WHERE user_id = $1`,
              [userId]
            );
            const last = lastR?.rows?.[0]?.last as Date | null;
            lastActivityISO = last ? new Date(last).toISOString() : null;
          }
        } catch {}
        if (followupsLogged == null) {
          try {
            const hasTouches = await tableExists('touches');
            if (hasTouches) {
              const r = await pool.query(
                `SELECT COUNT(*)::int AS c
                 FROM touches
                 WHERE user_id = $1 AND kind = ANY($2)`,
                [userId, ['call','email','meeting','followup_logged']]
              );
              followupsLogged = r?.rows?.[0]?.c ?? 0;
              const lastR = await pool.query(
                `SELECT MAX(created_at) AS last FROM touches WHERE user_id = $1`,
                [userId]
              );
              const last = lastR?.rows?.[0]?.last as Date | null;
              lastActivityISO = last ? new Date(last).toISOString() : null;
            }
          } catch {}
        }
      }

      // Timezone and current week start (Monday 00:00 local)
      const tz = (() => {
        try {
          return (Intl.DateTimeFormat().resolvedOptions().timeZone) || null;
        } catch { return null; }
      })();
      const weekStartISO = (() => {
        try {
          const now = new Date();
          const day = now.getDay(); // 0=Sun,1=Mon,...
          const diffToMonday = (day === 0 ? -6 : 1 - day);
          const monday = new Date(now);
          monday.setDate(now.getDate() + diffToMonday);
          monday.setHours(0,0,0,0);
          return monday.toISOString();
        } catch { return null; }
      })();

      const payload = {
        routes: routesState,
        apis: apisState,
        db: { events: hasEvents, assets: hasAssets },
        eventTypes90d,
        indexes: {
          events_user_type_created_at: eventsIdxTypeCreatedAt,
          events_user_asset: eventsIdxUserAsset,
        },
        samples: {
          assetsTracked: assetsTracked ?? 0,
          followupsLogged: followupsLogged ?? 0,
          lastActivityISO: lastActivityISO,
        },
        tz,
        weekStartISO,
      };
      return res.json(payload);
    } catch (e: any) {
      const message = e?.message || 'diagnostic failed';
      return res.status(500).json({ message });
    }
  });
  // User endpoint - returns demo user for unauthenticated requests, real user for authenticated requests
  app.get('/api/auth/user', async (req, res) => {
    const authHeader = req.headers.authorization;
    const verified = await getUserFromBearerAuthHeader(authHeader);
    if (verified?.id) {
      const decoded = jwt.decode(authHeader!.slice(7)) as any;
      const user = {
        id: verified.id,
        email: verified.email ?? decoded?.email,
        firstName: decoded?.user_metadata?.full_name?.split(' ')[0] || 'User',
        lastName: decoded?.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
        profileImageUrl: decoded?.user_metadata?.avatar_url || null,
        createdAt: new Date(decoded?.created_at || Date.now()),
        updatedAt: new Date(),
      };
      return res.json(user);
    }
    
    // Fall back to demo user without touching DB in demo mode
    if (isDemo(req)) {
      return res.json({
        id: 'demo-user',
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // If not demo mode and no JWT, treat as unauthenticated
    res.status(401).json({ message: 'Not authenticated' });
  });

  // Demo bypass route for testing (stateless)
  app.post('/api/auth/demo', async (_req, res) => {
    try {
      const demoUser = await storage.upsertUser({
        id: 'demo-user',
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
      });
      res.json(demoUser);
    } catch (error) {
      console.error("Error creating demo user:", error);
      res.status(500).json({ message: "Failed to create demo user" });
    }
  });

  // Demo auth status (stateless) – use X-Demo-Mode header
  app.get('/api/auth/demo/user', async (req, res) => {
    if (req.headers['x-demo-mode'] === 'true') {
      return res.json({
        id: 'demo-user',
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    res.status(401).json({ message: 'Not authenticated' });
  });

  // Unified bootstrap endpoint
  app.get('/api/bootstrap', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
        try {
          await acceptPendingListingInvites(userId, email);
        } catch (inviteError: any) {
          console.error('Pending invite acceptance failed:', inviteError?.message || inviteError);
        }
      }
      const fromDemo = isDemo(req);
      let profile: any = null;
      if (fromDemo) {
        profile = await demo.getProfile(userId);
      } else {
        profile = await storage.getProfile(userId);
      }
      // user payload: prefer JWT claims if present
      let user: any = { id: userId };
      const authHeader = req.headers.authorization;
      try {
        if (authHeader?.startsWith('Bearer ')) {
          const decoded = jwt.decode(authHeader.slice(7)) as any;
          if (decoded) {
            user = {
              id: decoded.sub || userId,
              email: decoded.email,
              user_metadata: decoded.user_metadata,
              app_metadata: decoded.app_metadata,
              created_at: decoded.created_at,
            };
          }
        }
      } catch {}

      // Minimal app config
      const config = {
        features: {
          googleEnabled: (process.env.VITE_ENABLE_GOOGLE_AUTH === '1' || process.env.VITE_ENABLE_GOOGLE_AUTH === 'true')
        }
      };

      res.json({ user, profile, config });
    } catch (error: any) {
      console.error('Bootstrap error:', error?.message || error);
      res.status(500).json({ message: 'Failed to bootstrap' });
    }
  });
  // Profile routes
  app.get('/api/profile', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const profile = await demo.getProfile(userId);
        return res.json(profile);
      }
      const profile = await storage.getProfile(userId);
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Listings (workspace) routes
  app.get('/api/listings', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const scope = String((req.query.scope as string) || '').toLowerCase();
      if (scope === 'shared') {
        if (isDemo(req)) {
          const list = await demo.getListingsSharedWith(userId);
          return res.json(list);
        }
        let rows;
        try {
          // Shared with current user via listing_members
          rows = await db
            .select({
              id: listings.id,
              userId: listings.userId,
              title: listings.title,
              address: listings.address,
              lat: listings.lat,
              lng: listings.lng,
              submarket: listings.submarket,
              createdAt: listings.createdAt,
              archivedAt: listings.archivedAt,
              prospectCount: sql<number>`COALESCE((SELECT COUNT(*)::int FROM ${listingProspects} lp WHERE lp.listing_id = ${listings.id}), 0)`,
            })
            .from(listings)
            .innerJoin(listingMembers, and(eq(listingMembers.listingId, listings.id), eq(listingMembers.userId, userId)))
            .where(and(eq(sql`COALESCE(${listings.archivedAt} IS NULL, TRUE)`, true)));
        } catch (error) {
          if (!shouldUseSupabaseReadFallback(error) || !supabaseAdmin) throw error;
          rows = await getListingsViaSupabase(userId, 'shared');
        }
        return res.json(rows);
      }
      if (isDemo(req)) {
        const list = await demo.getListings(userId);
        // Filter out archived items to match DB behavior
        const active = list.filter((l: any) => !l.archivedAt);
        // Enrich with prospect counts
        const links = await Promise.all(active.map(async (l: any) => {
          const linked = await demo.getListingLinks(userId, l.id);
          return { ...l, prospectCount: linked.length };
        }));
        return res.json(links);
      }
      let list;
      try {
        list = await storage.getListings(userId);
      } catch (error) {
        if (!shouldUseSupabaseReadFallback(error) || !supabaseAdmin) throw error;
        list = await getListingsViaSupabase(userId, 'owned');
      }
      res.json(list);
    } catch (error) {
      console.error('Error fetching listings:', error);
      res.status(500).json({ message: 'Failed to fetch listings' });
    }
  });

  app.post('/api/listings', requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      const userId = getUserId(req);
      console.log(`[route] POST /api/listings user=${userId} bodyKeys=${Object.keys(req.body||{}).join(',')}`);
      const { title, address, lat, lng, submarket, dealType, size, price } = req.body || {};
      if (!title || String(title).trim() === '') {
        return res.status(400).json({ message: 'title is required' });
      }
      if (isDemo(req)) {
        const item = {
          id: randomUUID(),
          userId,
          title: title.trim(),
          address: address || title.trim(),
          lat: lat || '',
          lng: lng || '',
          submarket: submarket || null,
          createdAt: new Date().toISOString(),
          archivedAt: null,
        };
        await demo.addListing(userId, item);
        return res.status(201).json({ ...item, prospectCount: 0 });
      }
      const listing = await storage.createListing({ 
        userId, 
        title: title || address || 'Workspace', 
        address: (address && String(address).trim() !== '') ? address : (title || 'Workspace'), 
        lat: lat != null && lat !== '' ? String(lat) : null, 
        lng: lng != null && lng !== '' ? String(lng) : null, 
        submarket, 
        // avoid inserting columns that may not exist without migrations
      });
      const t1 = Date.now();
      console.log(`[route] POST /api/listings -> 201 in ${t1 - t0}ms user=${userId}`);
      res.status(201).json(listing);
    } catch (error) {
      console.error('Error creating listing:', error);
      res.status(500).json({ message: 'Failed to create listing' });
    }
  });

  app.get('/api/listings/:id', requireAuth, async (req, res) => {
    try {
      // Allow owner or members to view
      await requireViewAccess(req, req.params.id);
      if (isDemo(req)) {
        const demoListing = await demo.getListingAny(req.params.id);
        if (!demoListing) return res.status(404).json({ message: 'Listing not found' });
        return res.json(demoListing);
      }
      let listing;
      try {
        listing = await storage.getListingAny(req.params.id);
      } catch (error) {
        if (!shouldUseSupabaseReadFallback(error) || !supabaseAdmin) throw error;
        listing = await getListingViaSupabase(req.params.id);
      }
      if (!listing) return res.status(404).json({ message: 'Listing not found' });
      res.json(listing);
    } catch (error) {
      console.error('Error getting listing:', error);
      res.status(500).json({ message: 'Failed to get listing' });
    }
  });

  app.post('/api/listings/:id/archive', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const okDemo = await demo.archiveListing(userId, req.params.id);
        if (!okDemo) return res.status(404).json({ message: 'Listing not found' });
        return res.json({ ok: true });
      }
      const ok = await storage.archiveListing(req.params.id, userId);
      if (!ok) return res.status(404).json({ message: 'Listing not found' });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error archiving listing:', error);
      res.status(500).json({ message: 'Failed to archive listing' });
    }
  });

  app.delete('/api/listings/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const okDemo = await demo.deleteListing(userId, req.params.id);
        if (!okDemo) return res.status(404).json({ message: 'Listing not found' });
        return res.json({ ok: true });
      }
      const ok = await storage.deleteListing(req.params.id, userId);
      if (!ok) return res.status(404).json({ message: 'Listing not found' });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting listing:', error);
      res.status(500).json({ message: 'Failed to delete listing' });
    }
  });

  app.get('/api/listings/:id/prospects', requireAuth, async (req, res) => {
    try {
      await requireViewAccess(req, req.params.id);
      if (isDemo(req)) {
        const links = await demo.getListingLinksAll(req.params.id);
        const allProspects = await demo.getProspectsAll();
        const set = new Set(links.map((l: any) => l.prospectId));
        const items = (allProspects || []).filter((p: any) => set.has(p.id));
        return res.json(items);
      }
      let items;
      try {
        items = await storage.getListingProspectsAny(req.params.id);
      } catch (error) {
        if (!shouldUseSupabaseReadFallback(error) || !supabaseAdmin) throw error;
        items = await getListingProspectsViaSupabase(req.params.id);
      }
      res.json(items);
    } catch (error) {
      console.error('Error fetching listing prospects:', error);
      res.status(500).json({ message: 'Failed to fetch listing prospects' });
    }
  });

  app.post('/api/listings/:id/prospects', requireAuth, async (req, res) => {
    try {
      await requireEditAccess(req, req.params.id);
      const { prospectId } = req.body || {};
      if (!prospectId) return res.status(400).json({ message: 'prospectId is required' });
      if (isDemo(req)) {
        const userId = getUserId(req);
        await demo.linkProspect(userId, req.params.id, prospectId);
        return res.status(201).json({ ok: true });
      }
      await storage.linkProspectToListingAny({ listingId: req.params.id, prospectId });
      res.status(201).json({ ok: true });
    } catch (error) {
      console.error('Error linking prospect:', error);
      // Handle unique violation gracefully
      return res.status(200).json({ ok: true });
    }
  });

  app.delete('/api/listings/:id/prospects/:prospectId', requireAuth, async (req, res) => {
    try {
      await requireEditAccess(req, req.params.id);
      if (isDemo(req)) {
        const userId = getUserId(req);
        const okDemo = await demo.unlinkProspect(userId, req.params.id, req.params.prospectId);
        if (!okDemo) return res.status(404).json({ message: 'Not linked' });
        return res.status(204).send();
      }
      const ok = await storage.unlinkProspectFromListingAny({ listingId: req.params.id, prospectId: req.params.prospectId });
      if (!ok) return res.status(404).json({ message: 'Not linked' });
      res.status(204).send();
    } catch (error) {
      console.error('Error unlinking prospect:', error);
      res.status(500).json({ message: 'Failed to unlink prospect' });
    }
  });

  app.get('/api/listings/:id/export', requireAuth, async (req, res) => {
    try {
      await requireViewAccess(req, req.params.id);
      const userId = getUserId(req);
      const { start, end } = req.query as any;
      if (isDemo(req)) {
        const interactionsAll = await demo.getInteractions(userId);
        const interactions = (interactionsAll || []).filter((i: any) => i.listingId === req.params.id)
          .filter((i: any) => (!start || i.date >= start) && (!end || i.date <= end));
        const links = await demo.getListingLinksAll(req.params.id);
        const allProspects = await demo.getProspectsAll();
        const prospectMap = new Map(allProspects.map((p: any) => [p.id, p]));
        const byType: Record<string, number> = {};
        interactions.forEach((i: any) => { byType[i.type] = (byType[i.type] || 0) + 1; });
        const lines: string[] = [];
        lines.push('Summary');
        lines.push('Type,Count');
        Object.entries(byType).forEach(([t, c]) => lines.push(`${t},${c}`));
        lines.push('');
        lines.push('Details');
        lines.push('Date,Type,Prospect,Address,Notes,NextSteps');
        interactions.forEach((i: any) => {
          const p: any = prospectMap.get(i.prospectId);
          const name = p?.name?.replaceAll(',', ' ') || '';
          const address = p?.name?.replaceAll(',', ' ') || '';
          const notes = (i.notes || '').replaceAll('\n', ' ').replaceAll(',', ' ');
          const next = (i.nextFollowUp || '').replaceAll(',', ' ');
          lines.push(`${i.date},${i.type},${name},${address},${notes},${next}`);
        });
        const csv = lines.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="listing-${req.params.id}-export.csv"`);
        return res.send(csv);
      }
      const listing = await storage.getListing(req.params.id, userId);
      if (!listing) return res.status(404).json({ message: 'Listing not found' });
      const interactions = await storage.getContactInteractions(userId, undefined, req.params.id, start, end);
      const lp = await storage.getListingProspects(req.params.id, userId);
      const prospectMap = new Map(lp.map(p => [p.id, p]));
      const byType: Record<string, number> = {};
      interactions.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });
      const summaryRows = Object.entries(byType).map(([type, count]) => ({ type, count }));
      // Build CSV
      const lines: string[] = [];
      lines.push('Summary');
      lines.push('Type,Count');
      summaryRows.forEach(r => lines.push(`${r.type},${r.count}`));
      lines.push('');
      lines.push('Details');
      lines.push('Date,Type,Prospect,Address,Notes,NextSteps');
      interactions.forEach(i => {
        const p = prospectMap.get(i.prospectId as any);
        const name = p?.name?.replaceAll(',', ' ') || '';
        const address = p?.name?.replaceAll(',', ' ') || '';
        const notes = (i.notes || '').replaceAll('\n', ' ').replaceAll(',', ' ');
        const next = (i.nextFollowUp || '').replaceAll(',', ' ');
        lines.push(`${i.date},${i.type},${name},${address},${notes},${next}`);
      });
      const csv = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="listing-${req.params.id}-export.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('Error exporting listing CSV:', error);
      res.status(500).json({ message: 'Failed to export CSV' });
    }
  });

  // Listing members (sharing)
  app.get('/api/listings/:id/members', requireAuth, async (req, res) => {
    try {
      // Any member (viewer/editor/owner) can view members list
      await requireViewAccess(req, req.params.id);
      if (isDemo(req)) {
        const list = await demo.getListingMembers(req.params.id);
        // Include owner
        const owner = await demo.getListingOwner(req.params.id);
        const ownerEntry = owner ? [{ userId: owner.userId, role: 'owner', email: owner.email }] : [];
        return res.json([...ownerEntry, ...list]);
      }
      let results;
      try {
        // Fetch owner
        const [listRow] = await db.select().from(listings).where(eq(listings.id, req.params.id));
        if (!listRow) return res.status(404).json({ message: 'Listing not found' });
        // Fetch members
        const members = await db.select().from(listingMembers).where(eq(listingMembers.listingId, req.params.id));
        // Resolve basic email from users/profiles
        results = [];
        // Owner entry
        let ownerEmail: string | null = await resolveEmailByUserId(listRow.userId);
        results.push({ userId: listRow.userId, role: 'owner', email: ownerEmail });
        for (const m of members) {
          if (m.userId === listRow.userId) continue;
          const email = await resolveEmailByUserId(m.userId);
          results.push({ userId: m.userId, role: m.role, email });
        }
        const invites = await db
          .select()
          .from(listingInvites)
          .where(and(eq(listingInvites.listingId, req.params.id), eq(listingInvites.status, 'pending')));
        for (const invite of invites) {
          results.push({
            id: invite.id,
            email: invite.email,
            role: invite.role,
            status: invite.status,
            emailDelivery: invite.emailDelivery,
            createdAt: invite.createdAt,
            kind: 'invite',
          });
        }
      } catch (error) {
        if (!shouldUseSupabaseReadFallback(error) || !supabaseAdmin) throw error;
        results = await getListingMembersViaSupabase(req.params.id);
      }
      res.json(results);
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error fetching listing members:', error);
      res.status(500).json({ message: 'Failed to fetch listing members' });
    }
  });

  app.post('/api/listings/:id/members', requireAuth, async (req, res) => {
    try {
      await requireOwnerAccess(req, req.params.id);
      const { email, role } = req.body || {};
      const normalizedEmail = normalizeInviteEmail(email);
      if (!normalizedEmail || !isValidInviteEmail(normalizedEmail)) {
        return res.status(400).json({ code: 'invalid_email', message: 'Enter a valid email address.' });
      }
      if (isDemo(req)) {
        // Explicitly disallow invites in demo mode
        return res.status(400).json({ code: 'demo_invites_disabled', message: 'Invites are disabled in demo mode.' });
      }
      const roleValue = normalizeWorkspaceRole(role);
      // Lookup user by email
      const found = await findUserIdByEmail(normalizedEmail);
      const [listing] = await db.select().from(listings).where(eq(listings.id, req.params.id));
      if (!listing) return res.status(404).json({ code: 'workspace_not_found', message: 'Workspace not found.' });

      if (found) {
        if (listing.userId === found.id) {
          return res.status(409).json({ code: 'already_member', message: 'That email is already the workspace owner.' });
        }

        const [existingMember] = await db
          .select()
          .from(listingMembers)
          .where(and(eq(listingMembers.listingId, req.params.id), eq(listingMembers.userId, found.id)));
        if (existingMember) {
          return res.status(409).json({ code: 'already_member', message: 'That email is already a member.' });
        }

        // Ensure target user exists for FK, then add member.
        await ensureUser(found.id, found.email);
        await db
          .insert(listingMembers)
          .values({ listingId: req.params.id, userId: found.id, role: roleValue })
          .onConflictDoUpdate({ target: [listingMembers.listingId, listingMembers.userId], set: { role: roleValue } });
        await db
          .update(listingInvites)
          .set({ status: 'accepted', acceptedAt: new Date() })
          .where(and(eq(listingInvites.listingId, req.params.id), eq(listingInvites.email, normalizedEmail), eq(listingInvites.status, 'pending')));
        return res.status(201).json({ userId: found.id, email: found.email, role: roleValue, kind: 'member' });
      }

      const [existingInvite] = await db
        .select()
        .from(listingInvites)
        .where(and(eq(listingInvites.listingId, req.params.id), eq(listingInvites.email, normalizedEmail), eq(listingInvites.status, 'pending')));
      if (existingInvite) {
        return res.status(409).json({ code: 'invite_pending', message: 'Invite already pending for this email.' });
      }

      const [invite] = await db
        .insert(listingInvites)
        .values({
          listingId: req.params.id,
          email: normalizedEmail,
          role: roleValue,
          invitedBy: getUserId(req),
          status: 'pending',
        })
        .returning();

      const emailDelivery = await sendWorkspaceInviteEmail(req, normalizedEmail);
      await db
        .update(listingInvites)
        .set({ emailDelivery })
        .where(eq(listingInvites.id, invite.id));

      return res.status(201).json({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        createdAt: invite.createdAt,
        kind: 'invite',
        emailDelivery,
      });
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error adding listing member:', error);
      res.status(500).json({ message: 'Failed to add listing member' });
    }
  });

  app.delete('/api/listings/:id/invites/:inviteId', requireAuth, async (req, res) => {
    try {
      await requireOwnerAccess(req, req.params.id);
      if (isDemo(req)) {
        return res.status(400).json({ code: 'demo_invites_disabled', message: 'Invites are disabled in demo mode.' });
      }
      await db
        .update(listingInvites)
        .set({ status: 'revoked' })
        .where(and(eq(listingInvites.id, req.params.inviteId), eq(listingInvites.listingId, req.params.id), eq(listingInvites.status, 'pending')));
      res.status(204).send();
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error revoking listing invite:', error);
      res.status(500).json({ message: 'Failed to revoke invite' });
    }
  });

  app.patch('/api/listings/:id/members/:userId', requireAuth, async (req, res) => {
    try {
      await requireOwnerAccess(req, req.params.id);
      const role = req.body?.role;
      if (!role || !['owner', 'editor', 'viewer'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
      if (isDemo(req)) {
        await demo.updateListingMember(req.params.id, req.params.userId, role);
        return res.json({ ok: true });
      }
      // Disallow changing owner record via members table
      const [row] = await db.select().from(listings).where(eq(listings.id, req.params.id));
      if (row && row.userId === req.params.userId) return res.status(400).json({ message: 'Cannot change owner role' });
      await db.update(listingMembers)
        .set({ role })
        .where(and(eq(listingMembers.listingId, req.params.id), eq(listingMembers.userId, req.params.userId)));
      res.json({ ok: true });
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error updating listing member:', error);
      res.status(500).json({ message: 'Failed to update listing member' });
    }
  });

  app.delete('/api/listings/:id/members/:userId', requireAuth, async (req, res) => {
    try {
      await requireOwnerAccess(req, req.params.id);
      if (isDemo(req)) {
        await demo.removeListingMember(req.params.id, req.params.userId);
        return res.status(204).send();
      }
      // Prevent removing owner
      const [row] = await db.select().from(listings).where(eq(listings.id, req.params.id));
      if (row && row.userId === req.params.userId) return res.status(400).json({ message: 'Cannot remove owner' });
      await db.delete(listingMembers).where(and(eq(listingMembers.listingId, req.params.id), eq(listingMembers.userId, req.params.userId)));
      res.status(204).send();
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error removing listing member:', error);
      res.status(500).json({ message: 'Failed to remove listing member' });
    }
  });

  // Workspaces alias routes (mirror Listings endpoints)
  // These provide a stable, user-facing naming while preserving DB schema names
  app.get('/api/workspaces', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const list = await demo.getListings(userId);
        const active = list.filter((l: any) => !l.archivedAt);
        const links = await Promise.all(active.map(async (l: any) => {
          const linked = await demo.getListingLinks(userId, l.id);
          return { ...l, prospectCount: linked.length };
        }));
        return res.json(links);
      }
      const list = await storage.getListings(userId);
      res.json(list);
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      res.status(500).json({ message: 'Failed to fetch workspaces' });
    }
  });

  app.post('/api/workspaces', requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      const userId = getUserId(req);
      const { title, address, lat, lng, submarket } = req.body || {};
      if (!title || String(title).trim() === '') {
        return res.status(400).json({ message: 'title is required' });
      }
      if (isDemo(req)) {
        const item = {
          id: randomUUID(),
          userId,
          title: title.trim(),
          address: address || title.trim(),
          lat: lat || '',
          lng: lng || '',
          submarket: submarket || null,
          createdAt: new Date().toISOString(),
          archivedAt: null,
        };
        await demo.addListing(userId, item);
        return res.status(201).json({ ...item, prospectCount: 0 });
      }
      const listing = await storage.createListing({ 
        userId, 
        title: title || address || 'Workspace', 
        address: (address && String(address).trim() !== '') ? address : (title || 'Workspace'), 
        lat: lat != null && lat !== '' ? String(lat) : null, 
        lng: lng != null && lng !== '' ? String(lng) : null, 
        submarket, 
      });
      const t1 = Date.now();
      console.log(`[route] POST /api/workspaces -> 201 in ${t1 - t0}ms user=${userId}`);
      res.status(201).json(listing);
    } catch (error) {
      console.error('Error creating workspace:', error);
      res.status(500).json({ message: 'Failed to create workspace' });
    }
  });

  app.get('/api/workspaces/:id', requireAuth, async (req, res) => {
    try {
      await requireViewAccess(req, req.params.id);
      if (isDemo(req)) {
        const demoListing = await demo.getListingAny(req.params.id);
        if (!demoListing) return res.status(404).json({ message: 'Workspace not found' });
        return res.json(demoListing);
      }
      const listing = await storage.getListingAny(req.params.id);
      if (!listing) return res.status(404).json({ message: 'Workspace not found' });
      res.json(listing);
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error getting workspace:', error);
      res.status(500).json({ message: 'Failed to get workspace' });
    }
  });

  app.post('/api/workspaces/:id/archive', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      await requireOwnerAccess(req, req.params.id);
      if (isDemo(req)) {
        const okDemo = await demo.archiveListing(userId, req.params.id);
        if (!okDemo) return res.status(404).json({ message: 'Workspace not found' });
        return res.json({ ok: true });
      }
      const ok = await storage.archiveListing(req.params.id, userId);
      if (!ok) return res.status(404).json({ message: 'Workspace not found' });
      res.json({ ok: true });
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error archiving workspace:', error);
      res.status(500).json({ message: 'Failed to archive workspace' });
    }
  });

  app.delete('/api/workspaces/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      await requireOwnerAccess(req, req.params.id);
      if (isDemo(req)) {
        const okDemo = await demo.deleteListing(userId, req.params.id);
        if (!okDemo) return res.status(404).json({ message: 'Workspace not found' });
        return res.json({ ok: true });
      }
      const ok = await storage.deleteListing(req.params.id, userId);
      if (!ok) return res.status(404).json({ message: 'Workspace not found' });
      res.json({ ok: true });
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error deleting workspace:', error);
      res.status(500).json({ message: 'Failed to delete workspace' });
    }
  });

  app.get('/api/workspaces/:id/prospects', requireAuth, async (req, res) => {
    try {
      await requireViewAccess(req, req.params.id);
      if (isDemo(req)) {
        const links = await demo.getListingLinksAll(req.params.id);
        const allProspects = await demo.getProspectsAll();
        const set = new Set(links.map((l: any) => l.prospectId));
        const list = (allProspects || []).filter((p: any) => set.has(p.id));
        return res.json(list);
      }
      const list = await storage.getListingProspectsAny(req.params.id);
      res.json(list);
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error fetching workspace prospects:', error);
      res.status(500).json({ message: 'Failed to fetch workspace prospects' });
    }
  });

  app.post('/api/workspaces/:id/prospects', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      await requireEditAccess(req, req.params.id);
      const { prospectId } = req.body || {};
      if (!prospectId) return res.status(400).json({ message: 'prospectId is required' });
      if (isDemo(req)) {
        await demo.linkProspect(userId, req.params.id, prospectId);
        return res.status(201).json({ ok: true });
      }
      await storage.linkProspectToListingAny({ listingId: req.params.id, prospectId });
      res.status(201).json({ ok: true });
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error linking prospect:', error);
      res.status(500).json({ message: 'Failed to link prospect' });
    }
  });

  app.delete('/api/workspaces/:id/prospects/:prospectId', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      await requireEditAccess(req, req.params.id);
      if (isDemo(req)) {
        const okDemo = await demo.unlinkProspect(userId, req.params.id, req.params.prospectId);
        if (!okDemo) return res.status(404).json({ message: 'Not linked' });
        return res.status(204).send();
      }
      const ok = await storage.unlinkProspectFromListingAny({ listingId: req.params.id, prospectId: req.params.prospectId });
      if (!ok) return res.status(404).json({ message: 'Not linked' });
      res.status(204).send();
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error unlinking prospect:', error);
      res.status(500).json({ message: 'Failed to unlink prospect' });
    }
  });

  app.get('/api/workspaces/:id/export', requireAuth, async (req, res) => {
    try {
      await requireViewAccess(req, req.params.id);
      const userId = getUserId(req);
      const { start, end } = req.query as any;
      if (isDemo(req)) {
        const interactionsAll = await demo.getInteractions(userId);
        const interactions = (interactionsAll || []).filter((i: any) => i.listingId === req.params.id)
          .filter((i: any) => (!start || i.date >= start) && (!end || i.date <= end));
        const links = await demo.getListingLinksAll(req.params.id);
        const allProspects = await demo.getProspectsAll();
        const prospectMap = new Map(allProspects.map((p: any) => [p.id, p]));
        const byType: Record<string, number> = {};
        interactions.forEach((i: any) => { byType[i.type] = (byType[i.type] || 0) + 1; });
        const lines: string[] = [];
        lines.push('Summary');
        lines.push('Type,Count');
        Object.entries(byType).forEach(([t, c]) => lines.push(`${t},${c}`));
        lines.push('');
        lines.push('Details');
        lines.push('Date,Type,Prospect,Address,Notes,NextSteps');
        interactions.forEach((i: any) => {
          const p: any = prospectMap.get(i.prospectId);
          const name = p?.name?.replaceAll(',', ' ') || '';
          const address = p?.name?.replaceAll(',', ' ') || '';
          const notes = (i.notes || '').replaceAll('\n', ' ').replaceAll(',', ' ');
          const next = (i.nextFollowUp || '').replaceAll(',', ' ');
          lines.push(`${i.date},${i.type},${name},${address},${notes},${next}`);
        });
        const csv = lines.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="workspace-${req.params.id}-export.csv"`);
        return res.send(csv);
      }
      const listing = await storage.getListingAny(req.params.id);
      if (!listing) return res.status(404).json({ message: 'Workspace not found' });
      const interactions = await storage.getContactInteractions(userId, undefined, req.params.id, start, end);
      const lp = await storage.getListingProspectsAny(req.params.id);
      const prospectMap = new Map(lp.map(p => [p.id, p]));
      const byType: Record<string, number> = {};
      interactions.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });
      const summaryRows = Object.entries(byType).map(([type, count]) => ({ type, count }));
      const lines: string[] = [];
      lines.push('Summary');
      lines.push('Type,Count');
      summaryRows.forEach(r => lines.push(`${r.type},${r.count}`));
      lines.push('');
      lines.push('Details');
      lines.push('Date,Type,Prospect,Address,Notes,NextSteps');
      interactions.forEach(i => {
        const p = prospectMap.get(i.prospectId as any);
        const name = p?.name?.replaceAll(',', ' ') || '';
        const address = p?.name?.replaceAll(',', ' ') || '';
        const notes = (i.notes || '').replaceAll('\n', ' ').replaceAll(',', ' ');
        const next = (i.nextFollowUp || '').replaceAll(',', ' ');
        lines.push(`${i.date},${i.type},${name},${address},${notes},${next}`);
      });
      const csv = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="workspace-${req.params.id}-export.csv"`);
      res.send(csv);
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error exporting workspace CSV:', error);
      res.status(500).json({ message: 'Failed to export CSV' });
    }
  });

  app.post('/api/profile', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      console.log("Creating profile for user:", userId);
      console.log("Profile data:", req.body);
      
      const profileData = {
        id: userId,
        ...req.body
      };
      if (isDemo(req)) {
        const saved = await demo.setProfile(userId, profileData);
        return res.json(saved);
      }
      try {
        const profile = await storage.createProfile(profileData);
        console.log("Profile created successfully:", profile);
        return res.json(profile);
      } catch (e: any) {
        const code = e?.code || e?.originalError?.code;
        const msg = String(e?.message || '').toLowerCase();
        // Unique violation (duplicate primary key) -> treat as conflict so client can PATCH
        if (code === '23505' || msg.includes('duplicate key')) {
          return res.status(409).json({ message: 'Profile already exists' });
        }
        console.error('Error creating profile:', e);
        console.error('Stack trace:', e?.stack);
        return res.status(500).json({ message: 'Failed to create profile' });
      }
    } catch (error: any) {
      console.error("Error creating profile:", error);
      console.error("Stack trace:", error?.stack);
      res.status(500).json({ message: "Failed to create profile" });
    }
  });

  app.patch('/api/profile', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const updated = await demo.updateProfile(userId, req.body);
        return res.json(updated);
      }
      const profile = await storage.updateProfile(userId, req.body);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      // Sync submarkets from profile to submarkets table - disabled for now
      // if (req.body.submarkets) {
      //   await syncProfileSubmarkets(userId, req.body.submarkets);
      // }

      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Requirements routes with user association
  app.get('/api/requirements', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const list = await demo.getRequirements(userId);
        return res.json(list);
      }
      const requirements = await storage.getAllRequirements(userId);
      res.json(requirements);
    } catch (error) {
      console.error("Error fetching requirements:", error);
      res.status(500).json({ message: "Failed to fetch requirements" });
    }
  });

  app.post('/api/requirements', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const created = {
          id: randomUUID(),
          userId,
          title: req.body.title,
          source: req.body.source ?? null,
          location: req.body.location ?? null,
          contactName: req.body.contactName ?? null,
          contactEmail: req.body.contactEmail ?? null,
          contactPhone: req.body.contactPhone ?? null,
          spaceSize: req.body.spaceSize ?? null,
          timeline: req.body.timeline ?? null,
          status: req.body.status || 'active',
          tags: req.body.tags || [],
          notes: req.body.notes ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await demo.addRequirement(userId, created);
        return res.status(201).json(created);
      }
      const requirement = await storage.createRequirement({
        ...req.body,
        userId
      });
      res.status(201).json(requirement);
    } catch (error) {
      console.error("Error creating requirement:", error);
      res.status(500).json({ message: "Failed to create requirement" });
    }
  });

  app.patch('/api/requirements/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const updated = await demo.updateRequirement(userId, req.params.id, req.body);
        if (!updated) return res.status(404).json({ message: 'Requirement not found' });
        return res.json(updated);
      }
      const requirement = await storage.updateRequirement(req.params.id, userId, req.body);
      if (!requirement) {
        return res.status(404).json({ message: "Requirement not found" });
      }
      res.json(requirement);
    } catch (error) {
      console.error("Error updating requirement:", error);
      res.status(500).json({ message: "Failed to update requirement" });
    }
  });

  app.delete('/api/requirements/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const ok = await demo.deleteRequirement(userId, req.params.id);
        if (!ok) return res.status(404).json({ message: 'Requirement not found' });
        return res.status(204).send();
      }
      const deleted = await storage.deleteRequirement(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Requirement not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting requirement:", error);
      res.status(500).json({ message: "Failed to delete requirement" });
    }
  });

  // Market Comps routes with user association
  app.get('/api/market-comps', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const list = await demo.getMarketComps(userId);
        return res.json(list);
      }
      const comps = await storage.getAllMarketComps(userId);
      res.json(comps);
    } catch (error) {
      console.error('Error fetching market comps:', error);
      res.status(500).json({ message: 'Failed to fetch market comps' });
    }
  });

  app.post('/api/market-comps', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const created = {
          id: randomUUID(),
          userId,
          address: req.body.address,
          submarket: req.body.submarket ?? null,
          assetType: req.body.assetType,
          buildingSize: req.body.buildingSize ?? null,
          landSize: req.body.landSize ?? null,
          sourceLink: req.body.sourceLink ?? null,
          notes: req.body.notes ?? null,
          dealType: req.body.dealType,
          tenant: req.body.tenant ?? null,
          termMonths: req.body.termMonths ?? null,
          rate: req.body.rate ?? null,
          rateType: req.body.rateType ?? null,
          commencement: req.body.commencement ?? null,
          concessions: req.body.concessions ?? null,
          saleDate: req.body.saleDate ?? null,
          buyer: req.body.buyer ?? null,
          seller: req.body.seller ?? null,
          price: req.body.price ?? null,
          pricePerSf: req.body.pricePerSf ?? null,
          pricePerAcre: req.body.pricePerAcre ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await demo.addMarketComp(userId, created);
        return res.status(201).json(created);
      }
      const comp = await storage.createMarketComp({ ...req.body, userId });
      res.status(201).json(comp);
    } catch (error) {
      console.error('Error creating market comp:', error);
      res.status(500).json({ message: 'Failed to create market comp' });
    }
  });

  app.patch('/api/market-comps/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const updated = await demo.updateMarketComp(userId, req.params.id, req.body);
        if (!updated) return res.status(404).json({ message: 'Market comp not found' });
        return res.json(updated);
      }
      const comp = await storage.updateMarketComp(req.params.id, userId, req.body);
      if (!comp) {
        return res.status(404).json({ message: 'Market comp not found' });
      }
      res.json(comp);
    } catch (error) {
      console.error('Error updating market comp:', error);
      res.status(500).json({ message: 'Failed to update market comp' });
    }
  });

  app.delete('/api/market-comps/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const ok = await demo.deleteMarketComp(userId, req.params.id);
        if (!ok) return res.status(404).json({ message: 'Market comp not found' });
        return res.status(204).send();
      }
      const deleted = await storage.deleteMarketComp(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: 'Market comp not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting market comp:', error);
      res.status(500).json({ message: 'Failed to delete market comp' });
    }
  });

  // Prospects routes with user association
  app.get('/api/prospects', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const list = await demo.getProspects(userId);
        return res.json(list);
      }
      let prospects;
      try {
        prospects = await storage.getAllProspects(userId);
      } catch (error) {
        if (!shouldUseSupabaseReadFallback(error) || !supabaseAdmin) throw error;
        prospects = await getAllProspectsViaSupabase(userId);
      }
      res.json(prospects);
    } catch (error) {
      console.error("Error fetching prospects:", error);
      res.status(500).json({ message: "Failed to fetch prospects" });
    }
  });

  app.post('/api/prospects', requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      console.log(`[route] POST /api/prospects user=${userId} bodyKeys=${Object.keys(req.body||{}).join(',')}`);
      // Validate payload to match client shape (uses GeoJSON geometry)
      const ProspectInputSchema = z.object({
        name: z.string().min(1),
        status: ProspectStatus.default('prospect'),
        notes: z.string().optional().default(''),
        geometry: ProspectGeometry,
        submarketId: z.string().optional(),
        lastContactDate: z.string().optional(),
        followUpTimeframe: FollowUpTimeframe.optional(),
        followUpDueDate: z.string().nullable().optional(),
        // Contact and business info
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        contactCompany: z.string().optional(),
        buildingSf: z.number().int().nonnegative().nullable().optional(),
        lotSizeAcres: z.number().nonnegative().nullable().optional(),
        aiMetadata: z.record(z.any()).nullable().optional(),
        businessName: z.string().nullable().optional(),
        websiteUrl: z.string().nullable().optional(),
      });

      const parseResult = ProspectInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        console.error('Prospect validation error:', parseResult.error);
        return res.status(400).json({ message: 'Invalid prospect data', error: parseResult.error.errors });
      }

      if (isDemo(req)) {
        const created = {
          id: randomUUID(),
          ...parseResult.data,
          name: cleanProspectName(parseResult.data),
          createdDate: new Date().toISOString(),
        };
        await demo.addProspect(userId, created);
        return res.status(201).json(created);
      }

      const prospect = await storage.createProspect({ ...parseResult.data, name: cleanProspectName(parseResult.data), userId });
      const t1 = Date.now();
      console.log(`[route] POST /api/prospects -> 201 in ${t1 - t0}ms user=${userId}`);
      res.status(201).json(prospect);
    } catch (e) {
      const err: any = e;
      console.error('Error creating prospect:', {
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        constraint: err?.constraint,
        table: err?.table,
        stack: err?.stack,
      });
      res.status(500).json({ message: 'Failed to create prospect', error: err?.message || String(err) });
    }
  });

  app.patch('/api/prospects/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      const ProspectPatchSchema = z.object({
        name: z.string().min(1).optional(),
        status: ProspectStatus.optional(),
        notes: z.string().optional(),
        geometry: ProspectGeometry.optional(),
        submarketId: z.string().optional(),
        lastContactDate: z.string().optional(),
        followUpTimeframe: FollowUpTimeframe.optional(),
        followUpDueDate: z.string().nullable().optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        contactCompany: z.string().optional(),
        buildingSf: z.number().int().nonnegative().nullable().optional(),
        lotSizeAcres: z.number().nonnegative().nullable().optional(),
        aiMetadata: z.record(z.any()).nullable().optional(),
        businessName: z.string().nullable().optional(),
        websiteUrl: z.string().nullable().optional(),
      }).strict();

      const parseResult = ProspectPatchSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: 'Invalid prospect patch data', error: parseResult.error.errors });
      }

      if (isDemo(req)) {
        const updated = await demo.updateProspect(userId, req.params.id, parseResult.data);
        if (!updated) return res.status(404).json({ message: 'Prospect not found' });
        return res.json({ ...updated, newXpGained: 0 });
      }
      const result = await storage.updateProspect(req.params.id, userId, parseResult.data);
      if (!result) {
        return res.status(404).json({ message: "Prospect not found" });
      }
      res.json({ ...result.prospect, newXpGained: result.newXpGained });
    } catch (e) {
      const err: any = e;
      console.error('Error updating prospect:', {
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        constraint: err?.constraint,
        table: err?.table,
        stack: err?.stack,
      });
      res.status(500).json({ message: 'Failed to update prospect', error: err?.message || String(err) });
    }
  });

  app.delete('/api/prospects/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        await demo.deleteProspect(userId, req.params.id);
        return res.status(204).send();
      }
      const deleted = await storage.deleteProspect(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Prospect not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting prospect:", error);
      res.status(500).json({ message: "Failed to delete prospect" });
    }
  });

  // Submarkets routes with user association
  app.get('/api/submarkets', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const list = await demo.getSubmarkets(userId);
        // Deduplicate by name (case-insensitive) and prefer active entries.
        const seen = new Set<string>();
        const unique: any[] = [];
        for (const s of (list || [])) {
          const name = (s?.name || '').trim();
          if (!name) continue;
          const key = name.toLowerCase();
          const isActive = (s?.isActive !== false);
          if (seen.has(key)) continue;
          if (!isActive) continue;
          seen.add(key);
          unique.push({ id: s.id, name: s.name, color: s.color, isActive: !!s.isActive });
        }
        return res.json(unique);
      }
      const submarkets = await storage.getAllSubmarkets(userId);
      res.json(submarkets);
    } catch (error) {
      console.error("Error fetching submarkets:", error);
      res.status(500).json({ message: "Failed to fetch submarkets" });
    }
  });

  app.post('/api/submarkets', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const created = {
          id: randomUUID(),
          userId,
          name: req.body.name,
          color: req.body.color || null,
          isActive: !!req.body.isActive,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await demo.addSubmarket(userId, created);
        return res.status(201).json(created);
      }
      const submarket = await storage.createSubmarket({
        ...req.body,
        userId
      });
      res.status(201).json(submarket);
    } catch (error) {
      console.error("Error creating submarket:", error);
      res.status(500).json({ message: "Failed to create submarket" });
    }
  });

  app.patch('/api/submarkets/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const updated = await demo.updateSubmarket(userId, req.params.id, req.body);
        if (!updated) return res.status(404).json({ message: 'Submarket not found' });
        return res.json(updated);
      }
      const submarket = await storage.updateSubmarket(req.params.id, userId, req.body);
      if (!submarket) {
        return res.status(404).json({ message: "Submarket not found" });
      }
      res.json(submarket);
    } catch (error) {
      console.error("Error updating submarket:", error);
      res.status(500).json({ message: "Failed to update submarket" });
    }
  });

  app.delete('/api/submarkets/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const ok = await demo.deleteSubmarket(userId, req.params.id);
        if (!ok) return res.status(404).json({ message: 'Submarket not found' });
        return res.status(204).send();
      }
      const deleted = await storage.deleteSubmarket(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Submarket not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting submarket:", error);
      res.status(500).json({ message: "Failed to delete submarket" });
    }
  });

  // Contact interactions routes
  app.get('/api/interactions', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const prospectId = req.query.prospectId as string;
      if (isDemo(req)) {
        const interactions = await demo.getInteractions(userId, prospectId);
        return res.json(interactions);
      }
      const interactions = await storage.getContactInteractions(userId, prospectId);
      res.json(interactions);
    } catch (error) {
      console.error('Error getting contact interactions:', error);
      res.status(500).json({ message: 'Failed to get contact interactions' });
    }
  });

  app.post('/api/interactions', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      const interactionData = {
        userId,
        prospectId: req.body.prospectId,
        date: req.body.date,
        type: req.body.type,
        outcome: req.body.outcome,
        notes: req.body.notes || '',
        nextFollowUp: req.body.nextFollowUp || null,
        listingId: req.body.listingId || null,
      };
      if (interactionData.listingId) {
        // Require edit access when attaching to a listing
        await requireEditAccess(req, interactionData.listingId);
      }
      if (isDemo(req)) {
        const created = { id: randomUUID(), ...interactionData, createdAt: new Date().toISOString() };
        await demo.addInteraction(userId, created);
        return res.json(created);
      }

      const interaction = await storage.createContactInteraction(interactionData);
      res.json(interaction);
    } catch (error) {
      console.error('Error creating contact interaction:', error);
      res.status(500).json({ message: 'Failed to create contact interaction' });
    }
  });

  app.delete('/api/interactions/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const ok = await demo.deleteInteraction(userId, req.params.id);
        if (!ok) return res.status(404).json({ message: 'Interaction not found' });
        return res.status(204).send();
      }
      const deleted = await storage.deleteContactInteraction(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: 'Interaction not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting contact interaction:', error);
      res.status(500).json({ message: 'Failed to delete contact interaction' });
    }
  });

  const EmailMatchStatusSchema = z.enum(['needs_context', 'pending_review', 'auto_logged', 'approved', 'ignored', 'rejected']);

  app.get('/api/email/outlook/config', requireAuth, async (req, res) => {
    try {
      const config = getOutlookConfig(req);
      if (isDemo(req)) {
        return res.json({ configured: false, connected: false, reason: 'demo_mode' });
      }
      const userId = getUserId(req);
      const { rows } = await pool.query(`
        SELECT id, email_address, display_name, status, last_synced_at, error_message
        FROM public.email_connections
        WHERE user_id = $1 AND provider = 'outlook'
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId]);
      const connection = rows[0] || null;
      res.json({
        configured: config.configured,
        connected: connection?.status === 'connected',
        redirectUri: config.redirectUri,
        scopes: OUTLOOK_SCOPES,
        connection: connection ? {
          id: connection.id,
          emailAddress: connection.email_address,
          displayName: connection.display_name,
          status: connection.status,
          lastSyncedAt: connection.last_synced_at ? new Date(connection.last_synced_at).toISOString() : null,
          errorMessage: connection.error_message || null,
        } : null,
      });
    } catch (error) {
      console.error('Error fetching Outlook email config:', error);
      res.status(500).json({ message: 'Failed to fetch Outlook email config' });
    }
  });

  const buildOutlookAuthorizeUrl = (req: Request) => {
    if (isDemo(req)) {
      const error = new Error('Email connection is disabled in demo mode');
      (error as any).statusCode = 400;
      throw error;
    }
    const config = getOutlookConfig(req);
    if (!config.configured) {
      const error = new Error('Outlook OAuth is not configured');
      (error as any).statusCode = 400;
      (error as any).redirectUri = config.redirectUri;
      throw error;
    }
    const state = signEmailState({
      provider: 'outlook',
      userId: getUserId(req),
      iat: Date.now(),
      returnTo: typeof req.query.returnTo === 'string' ? req.query.returnTo : '/app/inbox',
      nonce: randomUUID(),
    });
    const authorizeUrl = new URL(config.authorizeUrl);
    authorizeUrl.searchParams.set('client_id', config.clientId);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
    authorizeUrl.searchParams.set('response_mode', 'query');
    authorizeUrl.searchParams.set('scope', OUTLOOK_SCOPES.join(' '));
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('prompt', 'select_account');
    return authorizeUrl.toString();
  };

  const startOutlookOAuth = async (req: Request, res: Response) => {
    try {
      res.redirect(buildOutlookAuthorizeUrl(req));
    } catch (error: any) {
      console.error('Error starting Outlook OAuth:', error);
      res.status(error?.statusCode || 500).json({
        message: error?.message || 'Failed to start Outlook connection',
        redirectUri: error?.redirectUri,
      });
    }
  };

  app.get('/api/ms365/auth-url', requireAuth, async (req, res) => {
    try {
      res.json({ url: buildOutlookAuthorizeUrl(req) });
    } catch (error: any) {
      console.error('Error building Outlook OAuth URL:', error);
      res.status(error?.statusCode || 500).json({
        message: error?.message || 'Failed to start Outlook connection',
        redirectUri: error?.redirectUri,
      });
    }
  });

  app.get('/api/email/outlook/connect', requireAuth, startOutlookOAuth);
  app.get('/api/integrations/microsoft365/connect', requireAuth, startOutlookOAuth);
  app.get('/api/ms365/start', requireAuth, startOutlookOAuth);

  app.get('/api/email/outlook/callback', async (req, res) => {
    let returnTo = '/app/inbox';
    try {
      const state = verifyEmailState(req.query.state);
      if (state.provider !== 'outlook') throw new Error('Invalid OAuth provider');
      returnTo = typeof state.returnTo === 'string' ? state.returnTo : returnTo;
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      if (!code) throw new Error(String(req.query.error_description || req.query.error || 'Missing authorization code'));
      const token = await exchangeOutlookCode(req, code);
      const expiresAt = Date.now() + Math.max(Number(token.expires_in || 3600) - 60, 60) * 1000;
      const accessToken = token.access_token as string;
      const profile = await graphGet(accessToken, 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName');
      const emailAddress = profile.mail || profile.userPrincipalName || null;
      const encrypted = encryptJson({ ...token, expires_at: expiresAt });
      await pool.query(`
        INSERT INTO public.email_connections (
          user_id, provider, provider_account_id, email_address, display_name, status, scopes,
          token_ciphertext, token_expires_at, error_message, updated_at
        )
        VALUES ($1, 'outlook', $2, $3, $4, 'connected', $5, $6, $7, NULL, now())
        ON CONFLICT (user_id, provider, provider_account_id) WHERE provider_account_id IS NOT NULL
        DO UPDATE SET
          email_address = EXCLUDED.email_address,
          display_name = EXCLUDED.display_name,
          status = 'connected',
          scopes = EXCLUDED.scopes,
          token_ciphertext = EXCLUDED.token_ciphertext,
          token_expires_at = EXCLUDED.token_expires_at,
          error_message = NULL,
          updated_at = now()
      `, [
        state.userId,
        profile.id,
        emailAddress,
        profile.displayName || emailAddress || 'Outlook',
        OUTLOOK_SCOPES,
        encrypted,
        new Date(expiresAt),
      ]);
      res.redirect(`${returnTo}?outlook=connected`);
    } catch (error: any) {
      console.error('Error completing Outlook OAuth:', error?.message || error);
      res.redirect(`${returnTo}?outlook=error`);
    }
  });

  async function syncOutlookMessagesForConnection(userId: string, connectionId: string, days: number) {
    const accessToken = await refreshOutlookToken(connectionId, userId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const folders = [
      { id: 'inbox', mailbox: 'inbox', direction: 'received', dateField: 'receivedDateTime' },
      { id: 'sentitems', mailbox: 'sent', direction: 'sent', dateField: 'sentDateTime' },
    ];
    let messagesSeen = 0;
    let messagesStored = 0;
    let matchesCreated = 0;

    const maxPagesPerFolder = Math.min(Math.max(Number(process.env.OUTLOOK_SYNC_MAX_PAGES || 5), 1), 20);
    for (const folder of folders) {
      const url = new URL(`https://graph.microsoft.com/v1.0/me/mailFolders/${folder.id}/messages`);
      url.searchParams.set('$top', '100');
      url.searchParams.set('$orderby', `${folder.dateField} desc`);
      url.searchParams.set('$filter', `${folder.dateField} ge ${cutoff}`);
      url.searchParams.set('$select', [
        'id',
        'conversationId',
        'subject',
        'from',
        'toRecipients',
        'ccRecipients',
        'bccRecipients',
        'sentDateTime',
        'receivedDateTime',
        'bodyPreview',
        'webLink',
        'hasAttachments',
      ].join(','));
      let nextUrl: string | null = url.toString();
      for (let page = 0; nextUrl && page < maxPagesPerFolder; page += 1) {
        const data = await graphGet(accessToken, nextUrl);
        nextUrl = typeof data['@odata.nextLink'] === 'string' ? data['@odata.nextLink'] : null;
        for (const message of data.value || []) {
          messagesSeen += 1;
          const sender = message.from?.emailAddress || {};
          const recipients = parseGraphRecipientEmails(message.toRecipients);
          const ccRecipients = parseGraphRecipientEmails(message.ccRecipients);
          const bccRecipients = parseGraphRecipientEmails(message.bccRecipients);
          const messageData = {
            provider: 'outlook',
            providerMessageId: message.id,
            providerThreadId: message.conversationId || null,
            mailbox: folder.mailbox,
            direction: folder.direction,
            subject: message.subject || '',
            senderEmail: sender.address || '',
            senderName: sender.name || '',
            recipientEmails: recipients,
            ccEmails: ccRecipients,
            sentAt: message.sentDateTime ? new Date(message.sentDateTime) : null,
            receivedAt: message.receivedDateTime ? new Date(message.receivedDateTime) : null,
            snippet: message.bodyPreview || '',
            attachmentNames: [],
            sourceUrl: message.webLink || '',
          };
          const inserted = await pool.query(`
            INSERT INTO public.email_messages (
              user_id, connection_id, provider, provider_message_id, provider_thread_id, mailbox, direction,
              subject, sender_email, sender_name, recipient_emails, cc_emails, sent_at, received_at,
              snippet, attachment_names, source_url, raw_metadata, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now())
            ON CONFLICT (user_id, provider, provider_message_id)
            DO UPDATE SET
              provider_thread_id = EXCLUDED.provider_thread_id,
              mailbox = EXCLUDED.mailbox,
              direction = EXCLUDED.direction,
              subject = EXCLUDED.subject,
              sender_email = EXCLUDED.sender_email,
              sender_name = EXCLUDED.sender_name,
              recipient_emails = EXCLUDED.recipient_emails,
              cc_emails = EXCLUDED.cc_emails,
              sent_at = EXCLUDED.sent_at,
              received_at = EXCLUDED.received_at,
              snippet = EXCLUDED.snippet,
              source_url = EXCLUDED.source_url,
              raw_metadata = EXCLUDED.raw_metadata,
              updated_at = now()
            RETURNING id, (xmax = 0) AS inserted
          `, [
            userId,
            connectionId,
            messageData.provider,
            messageData.providerMessageId,
            messageData.providerThreadId,
            messageData.mailbox,
            messageData.direction,
            messageData.subject,
            messageData.senderEmail,
            messageData.senderName,
            messageData.recipientEmails,
            messageData.ccEmails,
            messageData.sentAt,
            messageData.receivedAt,
            messageData.snippet,
            messageData.attachmentNames,
            messageData.sourceUrl,
            JSON.stringify({ hasAttachments: Boolean(message.hasAttachments), folder: folder.mailbox, bccRecipients }),
          ]);
          const emailMessageId = inserted.rows[0].id;
          if (inserted.rows[0].inserted) messagesStored += 1;

          const result = await pool.query(`
            INSERT INTO public.email_prospect_matches (
              user_id, email_message_id, prospect_id, confidence, match_status, match_reason,
              suggested_interaction_type, suggested_outcome, suggested_summary, updated_at
            )
            SELECT $1, $2, NULL, 0, 'needs_context', $3, 'email', 'contacted', $4, now()
            WHERE NOT EXISTS (
              SELECT 1 FROM public.email_prospect_matches
              WHERE user_id = $1 AND email_message_id = $2 AND prospect_id IS NULL
            )
            RETURNING id
          `, [
            userId,
            emailMessageId,
            'Captured email activity; no automatic prospect matching.',
            [messageData.subject, messageData.snippet].filter(Boolean).join('\n').slice(0, 1000),
          ]);
          if (result.rows[0]) matchesCreated += 1;
        }
      }
    }
    await pool.query(`
      UPDATE public.email_connections
      SET last_synced_at = now(), status = 'connected', error_message = NULL, updated_at = now()
      WHERE id = $1 AND user_id = $2
    `, [connectionId, userId]);
    return { messagesSeen, messagesStored, matchesCreated };
  }

  async function syncOutlookBccCapturesForConnection(userId: string, connectionId: string, days: number) {
    const accessToken = await refreshOutlookToken(connectionId, userId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let messagesSeen = 0;
    let bccCapturesSeen = 0;
    let messagesStored = 0;
    let matchesCreated = 0;

    const maxPages = Math.min(Math.max(Number(process.env.OUTLOOK_BCC_SYNC_MAX_PAGES || 2), 1), 10);
    const url = new URL('https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages');
    url.searchParams.set('$top', '50');
    url.searchParams.set('$orderby', 'sentDateTime desc');
    url.searchParams.set('$filter', `sentDateTime ge ${cutoff}`);
    url.searchParams.set('$select', [
      'id',
      'conversationId',
      'subject',
      'from',
      'toRecipients',
      'ccRecipients',
      'bccRecipients',
      'sentDateTime',
      'receivedDateTime',
      'bodyPreview',
      'webLink',
      'hasAttachments',
    ].join(','));
    let nextUrl: string | null = url.toString();
    for (let page = 0; nextUrl && page < maxPages; page += 1) {
      const data = await graphGet(accessToken, nextUrl);
      nextUrl = typeof data['@odata.nextLink'] === 'string' ? data['@odata.nextLink'] : null;
      for (const message of data.value || []) {
        messagesSeen += 1;
        const bccRecipients = parseGraphRecipientEmails(message.bccRecipients);
        const capturedByBcc = bccRecipients.some((email: string) => isConfiguredInboundAddress(email));
        if (!capturedByBcc) continue;

        bccCapturesSeen += 1;
        const sender = message.from?.emailAddress || {};
        const recipients = parseGraphRecipientEmails(message.toRecipients);
        const ccRecipients = parseGraphRecipientEmails(message.ccRecipients);
        const inserted = await pool.query(`
          INSERT INTO public.email_messages (
            user_id, connection_id, provider, provider_message_id, provider_thread_id, mailbox, direction,
            subject, sender_email, sender_name, recipient_emails, cc_emails, sent_at, received_at,
            snippet, attachment_names, source_url, raw_metadata, updated_at
          )
          VALUES ($1, $2, 'outlook', $3, $4, 'sent', 'sent', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
          ON CONFLICT (user_id, provider, provider_message_id)
          DO UPDATE SET
            provider_thread_id = EXCLUDED.provider_thread_id,
            mailbox = EXCLUDED.mailbox,
            direction = EXCLUDED.direction,
            subject = EXCLUDED.subject,
            sender_email = EXCLUDED.sender_email,
            sender_name = EXCLUDED.sender_name,
            recipient_emails = EXCLUDED.recipient_emails,
            cc_emails = EXCLUDED.cc_emails,
            sent_at = EXCLUDED.sent_at,
            received_at = EXCLUDED.received_at,
            snippet = EXCLUDED.snippet,
            source_url = EXCLUDED.source_url,
            raw_metadata = EXCLUDED.raw_metadata,
            updated_at = now()
          RETURNING id, (xmax = 0) AS inserted
        `, [
          userId,
          connectionId,
          message.id,
          message.conversationId || null,
          message.subject || '',
          sender.address || '',
          sender.name || '',
          recipients,
          ccRecipients,
          message.sentDateTime ? new Date(message.sentDateTime) : null,
          message.receivedDateTime ? new Date(message.receivedDateTime) : null,
          message.bodyPreview || '',
          [],
          message.webLink || '',
          JSON.stringify({
            hasAttachments: Boolean(message.hasAttachments),
            folder: 'sent',
            bccRecipients,
            captureSource: 'outlook-bcc-fallback',
          }),
        ]);
        const emailMessageId = inserted.rows[0].id;
        const isNewMessage = Boolean(inserted.rows[0]?.inserted);
        if (isNewMessage) messagesStored += 1;
        await awardCapturedEmailActivity(userId, emailMessageId, isNewMessage);

        const result = await pool.query(`
          INSERT INTO public.email_prospect_matches (
            user_id, email_message_id, prospect_id, confidence, match_status, match_reason,
            suggested_interaction_type, suggested_outcome, suggested_summary, updated_at
          )
          SELECT $1, $2, NULL, 0, 'needs_context', $3, 'email', 'contacted', $4, now()
          WHERE NOT EXISTS (
            SELECT 1 FROM public.email_prospect_matches
            WHERE user_id = $1 AND email_message_id = $2 AND prospect_id IS NULL
          )
          RETURNING id
        `, [
          userId,
          emailMessageId,
          'Captured from Outlook BCC fallback; Postmark webhook may not have delivered.',
          [message.subject || '', message.bodyPreview || ''].filter(Boolean).join('\n').slice(0, 1000),
        ]);
        if (result.rows[0]) matchesCreated += 1;
      }
    }

    await pool.query(`
      UPDATE public.email_connections
      SET last_synced_at = now(), status = 'connected', error_message = NULL, updated_at = now()
      WHERE id = $1 AND user_id = $2
    `, [connectionId, userId]);
    return { messagesSeen, bccCapturesSeen, messagesStored, matchesCreated };
  }

  app.post('/api/email/outlook/sync-bcc', requireAuth, async (req, res) => {
    try {
      if (isDemo(req)) return res.status(400).json({ message: 'Email sync is disabled in demo mode' });
      const userId = getUserId(req);
      const days = Math.min(Math.max(Number(req.body?.days || 14), 1), 30);
      const connectionResult = await pool.query(`
        SELECT id FROM public.email_connections
        WHERE user_id = $1 AND provider = 'outlook' AND status = 'connected'
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId]);
      const connectionId = connectionResult.rows[0]?.id;
      if (!connectionId) return res.status(400).json({ message: 'Connect Outlook before syncing BCC captures' });
      const result = await syncOutlookBccCapturesForConnection(userId, connectionId, days);
      res.json(result);
    } catch (error: any) {
      console.error('Error syncing Outlook BCC captures:', error);
      res.status(500).json({ message: error?.message || 'Failed to sync Outlook BCC captures' });
    }
  });

  app.post('/api/email/outlook/sync', requireAuth, async (req, res) => {
    try {
      if (isDemo(req)) return res.status(400).json({ message: 'Email sync is disabled in demo mode' });
      const userId = getUserId(req);
      const days = Math.min(Math.max(Number(req.body?.days || 90), 1), 365);
      const connectionResult = await pool.query(`
        SELECT id FROM public.email_connections
        WHERE user_id = $1 AND provider = 'outlook' AND status = 'connected'
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId]);
      const connectionId = connectionResult.rows[0]?.id;
      if (!connectionId) return res.status(400).json({ message: 'Connect Outlook before syncing email' });
      const run = await pool.query(`
        INSERT INTO public.email_sync_runs (user_id, connection_id, provider, status, started_at)
        VALUES ($1, $2, 'outlook', 'running', now())
        RETURNING id
      `, [userId, connectionId]);
      const runId = run.rows[0].id;
      try {
        const result = await syncOutlookMessagesForConnection(userId, connectionId, days);
        await pool.query(`
          UPDATE public.email_sync_runs
          SET status = 'completed', completed_at = now(), messages_seen = $3, messages_stored = $4, matches_created = $5
          WHERE id = $1 AND user_id = $2
        `, [runId, userId, result.messagesSeen, result.messagesStored, result.matchesCreated]);
        res.json({ runId, ...result });
      } catch (error: any) {
        await pool.query(`
          UPDATE public.email_sync_runs
          SET status = 'failed', completed_at = now(), error_message = $3
          WHERE id = $1 AND user_id = $2
        `, [runId, userId, error?.message || String(error)]);
        await pool.query(`
          UPDATE public.email_connections
          SET status = 'error', error_message = $3, updated_at = now()
          WHERE id = $1 AND user_id = $2
        `, [connectionId, userId, error?.message || String(error)]);
        throw error;
      }
    } catch (error) {
      console.error('Error syncing Outlook email:', error);
      res.status(500).json({ message: 'Failed to sync Outlook email' });
    }
  });

  app.get('/api/email/inbound/config', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const domain = process.env.EMAIL_INBOUND_DOMAIN || process.env.INBOUND_EMAIL_DOMAIN || '';
      const fixedAddress = process.env.EMAIL_INBOUND_ADDRESS || process.env.INBOUND_EMAIL_ADDRESS || '';
      const webhookBase =
        process.env.EMAIL_INBOUND_WEBHOOK_BASE_URL ||
        process.env.PUBLIC_APP_URL ||
        process.env.OUTLOOK_REDIRECT_BASE_URL ||
        `${req.protocol}://${req.get('host')}`;
      const webhookUrl = `${String(webhookBase).replace(/\/$/, '')}/api/email/inbound/webhook`;
      res.json({
        configured: Boolean(getInboundWebhookSecret()),
        domainConfigured: Boolean(domain || fixedAddress),
        intakeAddress: fixedAddress || (domain ? `levelcre+${userId}@${domain}` : null),
        webhookUrl,
        webhookSecretRequired: Boolean(getInboundWebhookSecret()),
        webhookAuthMethods: ['query-secret', 'bearer', 'x-levelcre-inbound-secret', 'basic'],
        webhookUrlTemplate: getInboundWebhookSecret() ? `${webhookUrl}?secret=<inbound-webhook-secret>` : webhookUrl,
      });
    } catch (error) {
      console.error('Error fetching inbound email config:', error);
      res.status(500).json({ message: 'Failed to fetch inbound email config' });
    }
  });

  app.post('/api/email/inbound/webhook', async (req, res) => {
    try {
      const payload = req.body || {};
      const authorizedBySecret = isInboundRequestAuthorized(req);
      const authorizedByRecipient = isRecipientVerifiedInboundPayload(payload);
      if (!authorizedBySecret && !authorizedByRecipient) {
        return res.status(getInboundWebhookSecret() ? 401 : 503).json({
          message: getInboundWebhookSecret()
            ? 'Invalid inbound email secret and inbound recipient did not match Level CRE intake address'
            : 'Inbound email webhook is not configured',
        });
      }
      const userId = await resolveInboundUserId({ ...req.query, ...payload });
      if (!userId) {
        console.warn('Inbound email could not be matched to a Level CRE user', {
          from: pickString(payload, ['from', 'From', 'sender', 'Sender']),
          recipients: getInboundRecipientEmails(payload),
          mailboxHash: pickString(payload, ['MailboxHash', 'mailboxHash']) || null,
          originalRecipient: pickString(payload, ['OriginalRecipient', 'originalRecipient']) || null,
        });
        return res.status(400).json({ message: 'Inbound email could not be matched to a Level CRE user' });
      }
      const userResult = await pool.query(`SELECT id FROM public.users WHERE id = $1 LIMIT 1`, [userId]);
      if (!userResult.rows[0]) return res.status(404).json({ message: 'Level CRE user not found' });
      const messageData = normalizeInboundPayload(payload, userId);
      messageData.rawMetadata = {
        ...(messageData.rawMetadata || {}),
        authMode: authorizedBySecret ? 'secret' : 'recipient',
      } as any;
      const result = await storeInboundEmailForReview(userId, messageData);
      res.json({ ok: true, provider: 'inbound', ...result });
    } catch (error) {
      console.error('Error processing inbound email webhook:', error);
      res.status(500).json({ message: 'Failed to process inbound email' });
    }
  });

  function mapEmailReviewRow(row: any) {
    return {
      id: row.id,
      matchStatus: row.match_status,
      confidence: row.confidence,
      matchReason: row.match_reason || '',
      suggestedInteractionType: row.suggested_interaction_type || 'email',
      suggestedOutcome: row.suggested_outcome || 'contacted',
      suggestedSummary: row.suggested_summary || '',
      suggestedNextFollowUp: row.suggested_next_follow_up ? new Date(row.suggested_next_follow_up).toISOString() : null,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      interactionId: row.interaction_id || null,
      email: {
        id: row.email_message_id,
        provider: row.provider,
        providerMessageId: row.provider_message_id,
        providerThreadId: row.provider_thread_id,
        mailbox: row.mailbox,
        direction: row.direction,
        subject: row.subject || '',
        senderEmail: row.sender_email || '',
        senderName: row.sender_name || '',
        recipientEmails: row.recipient_emails || [],
        ccEmails: row.cc_emails || [],
        sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
        receivedAt: row.received_at ? new Date(row.received_at).toISOString() : null,
        snippet: row.snippet || '',
        attachmentNames: row.attachment_names || [],
        sourceUrl: row.source_url || '',
      },
      prospect: row.prospect_id ? {
        id: row.prospect_id,
        name: row.prospect_name || '',
        address: row.prospect_address || '',
        status: row.prospect_status || '',
        contactCompany: row.prospect_contact_company || '',
        businessName: row.prospect_business_name || '',
      } : null,
      listing: row.listing_id ? {
        id: row.listing_id,
        title: row.listing_title || '',
      } : null,
    };
  }

  app.get('/api/email/review', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) return res.json([]);
      try {
        const connectionResult = await pool.query(`
          SELECT id FROM public.email_connections
          WHERE user_id = $1 AND provider = 'outlook' AND status = 'connected'
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1
        `, [userId]);
        const connectionId = connectionResult.rows[0]?.id;
        if (connectionId) {
          await syncOutlookBccCapturesForConnection(userId, connectionId, 14);
        }
      } catch (syncError: any) {
        console.warn('Skipping Outlook BCC recovery before email review fetch:', syncError?.message || syncError);
      }
      const status = typeof req.query.status === 'string' ? req.query.status : 'pending_review';
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
      const params: any[] = [userId, limit];
      const statusFilter = status === 'all' ? '' : `AND epm.match_status = $${params.push(status)}`;
      const result = await pool.query(`
        SELECT
          epm.*,
          em.provider,
          em.provider_message_id,
          em.provider_thread_id,
          em.mailbox,
          em.direction,
          em.subject,
          em.sender_email,
          em.sender_name,
          em.recipient_emails,
          em.cc_emails,
          em.sent_at,
          em.received_at,
          em.snippet,
          em.attachment_names,
          em.source_url,
          p.name AS prospect_name,
          p.address AS prospect_address,
          p.status AS prospect_status,
          p.contact_company AS prospect_contact_company,
          p.business_name AS prospect_business_name,
          l.title AS listing_title
        FROM public.email_prospect_matches epm
        JOIN public.email_messages em ON em.id = epm.email_message_id
        LEFT JOIN public.prospects p ON p.id = epm.prospect_id
        LEFT JOIN public.listings l ON l.id = epm.listing_id
        WHERE epm.user_id = $1
          ${statusFilter}
        ORDER BY COALESCE(em.sent_at, em.received_at, epm.created_at) DESC
        LIMIT $2
      `, params);
      res.json(result.rows.map(mapEmailReviewRow));
    } catch (error) {
      console.error('Error fetching email review queue:', error);
      res.status(500).json({ message: 'Failed to fetch email review queue' });
    }
  });

  app.get('/api/email/review/counts', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) return res.json({ needsContext: 0, pendingReview: 0, approved: 0, autoLogged: 0, ignored: 0, rejected: 0 });
      const result = await pool.query(`
        SELECT match_status, COUNT(*)::int AS count
        FROM public.email_prospect_matches
        WHERE user_id = $1
        GROUP BY match_status
      `, [userId]);
      const counts = Object.fromEntries(result.rows.map((row: any) => [row.match_status, row.count]));
      res.json({
        needsContext: counts.needs_context || 0,
        pendingReview: counts.pending_review || 0,
        approved: counts.approved || 0,
        autoLogged: counts.auto_logged || 0,
        ignored: counts.ignored || 0,
        rejected: counts.rejected || 0,
      });
    } catch (error) {
      console.error('Error fetching email review counts:', error);
      res.status(500).json({ message: 'Failed to fetch email review counts' });
    }
  });

  app.patch('/api/email/review/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) return res.status(404).json({ message: 'Email match not found' });
      const UpdateSchema = z.object({
        matchStatus: EmailMatchStatusSchema.optional(),
        prospectId: z.string().nullable().optional(),
        listingId: z.string().nullable().optional(),
        suggestedSummary: z.string().optional(),
        suggestedNextFollowUp: z.string().nullable().optional(),
      });
      const parsed = UpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid email review update', error: parsed.error.errors });
      }
      const update = parsed.data;
      if (update.prospectId) {
        const check = await pool.query('SELECT id FROM public.prospects WHERE id = $1 AND user_id = $2', [update.prospectId, userId]);
        if (check.rowCount === 0) return res.status(400).json({ message: 'Prospect is not available to this user' });
      }
      if (update.listingId) {
        await requireEditAccess(req, update.listingId);
      }
      const result = await pool.query(`
        UPDATE public.email_prospect_matches
        SET
          match_status = COALESCE($3, match_status),
          prospect_id = CASE WHEN $4::boolean THEN $5 ELSE prospect_id END,
          listing_id = CASE WHEN $6::boolean THEN $7 ELSE listing_id END,
          suggested_summary = COALESCE($8, suggested_summary),
          suggested_next_follow_up = CASE WHEN $9::boolean THEN $10::timestamp ELSE suggested_next_follow_up END,
          reviewed_at = CASE WHEN $3 IS NULL THEN reviewed_at ELSE now() END,
          reviewed_by_user_id = CASE WHEN $3 IS NULL THEN reviewed_by_user_id ELSE $2 END,
          updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `, [
        req.params.id,
        userId,
        update.matchStatus || null,
        Object.prototype.hasOwnProperty.call(update, 'prospectId'),
        update.prospectId || null,
        Object.prototype.hasOwnProperty.call(update, 'listingId'),
        update.listingId || null,
        update.suggestedSummary || null,
        Object.prototype.hasOwnProperty.call(update, 'suggestedNextFollowUp'),
        update.suggestedNextFollowUp ? new Date(update.suggestedNextFollowUp) : null,
      ]);
      if (result.rowCount === 0) return res.status(404).json({ message: 'Email match not found' });
      res.json({ id: req.params.id });
    } catch (error) {
      console.error('Error updating email review item:', error);
      res.status(500).json({ message: 'Failed to update email review item' });
    }
  });

  app.post('/api/email/review/:id/create-interaction', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) return res.status(404).json({ message: 'Email match not found' });
      const CreateEmailInteractionSchema = z.object({
        outcome: z.enum(['contacted', 'no_answer', 'left_message', 'scheduled_meeting', 'not_interested', 'follow_up_later']).optional(),
        notes: z.string().max(5000).optional(),
        nextFollowUp: z.string().nullable().optional(),
      });
      const parsed = CreateEmailInteractionSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid email log data', error: parsed.error.errors });
      }
      const input = parsed.data;
      const { rows } = await pool.query(`
        SELECT
          epm.*,
          em.provider,
          em.provider_message_id,
          em.provider_thread_id,
          em.sent_at,
          em.received_at,
          em.subject,
          em.snippet,
          em.sender_email
        FROM public.email_prospect_matches epm
        JOIN public.email_messages em ON em.id = epm.email_message_id
        WHERE epm.id = $1 AND epm.user_id = $2
      `, [req.params.id, userId]);
      const row = rows[0];
      if (!row) return res.status(404).json({ message: 'Email match not found' });
      if (!row.prospect_id) return res.status(400).json({ message: 'Choose a prospect before logging this email' });
      if (row.listing_id) await requireEditAccess(req, row.listing_id);

      const existing = await pool.query(`
        SELECT id FROM public.contact_interactions
        WHERE user_id = $1
          AND source_provider = $2
          AND source_message_id = $3
          AND prospect_id = $4
        LIMIT 1
      `, [userId, row.provider, row.provider_message_id, row.prospect_id]);
      if (existing.rows[0]) {
        await pool.query(`
          UPDATE public.email_prospect_matches
          SET interaction_id = $3, match_status = 'auto_logged', reviewed_at = now(), reviewed_by_user_id = $2, updated_at = now()
          WHERE id = $1 AND user_id = $2
        `, [req.params.id, userId, existing.rows[0].id]);
        return res.json({ interactionId: existing.rows[0].id, duplicate: true });
      }

      const interactionDate = row.sent_at || row.received_at || new Date();
      const defaultNotes = row.suggested_summary || [
        row.subject ? `Subject: ${row.subject}` : '',
        row.snippet || '',
        row.sender_email ? `From: ${row.sender_email}` : '',
      ].filter(Boolean).join('\n');
      const notes = typeof input.notes === 'string' ? input.notes.trim() : defaultNotes;
      const interactionIso = new Date(interactionDate).toISOString();
      const hasRequestedNextFollowUp = Object.prototype.hasOwnProperty.call(input, 'nextFollowUp');
      const nextFollowUpIso = hasRequestedNextFollowUp
        ? (input.nextFollowUp ? new Date(input.nextFollowUp).toISOString() : null)
        : (row.suggested_next_follow_up
          ? new Date(row.suggested_next_follow_up).toISOString()
          : addDaysAtNoonUtc(new Date(interactionDate), 14));
      const emailAlreadyAwarded = await pool.query(`
        SELECT id FROM public.skill_activities
        WHERE user_id = $1
          AND skill_type = 'followUp'
          AND action = $2
          AND related_id = $3
        LIMIT 1
      `, [userId, actionForInteractionType('email'), row.email_message_id]);
      const interaction = await storage.createContactInteraction({
        userId,
        prospectId: row.prospect_id,
        listingId: row.listing_id || null,
        date: interactionIso,
        type: row.suggested_interaction_type || 'email',
        outcome: input.outcome || row.suggested_outcome || 'contacted',
        notes,
        nextFollowUp: nextFollowUpIso,
        sourceProvider: row.provider,
        sourceMessageId: row.provider_message_id,
        sourceThreadId: row.provider_thread_id || null,
        sourceEmailMessageId: row.email_message_id,
        sourceMetadata: {
          emailReviewMatchId: req.params.id,
          defaultFollowUpDays: hasRequestedNextFollowUp || row.suggested_next_follow_up ? null : 14,
        },
      }, { skipXp: Boolean(emailAlreadyAwarded.rows[0]) });
      const interactionId = interaction.id;
      await pool.query(`
        UPDATE public.email_prospect_matches
        SET interaction_id = $3, match_status = 'auto_logged', reviewed_at = now(), reviewed_by_user_id = $2, updated_at = now()
        WHERE id = $1 AND user_id = $2
      `, [req.params.id, userId, interactionId]);
      await pool.query(`
        UPDATE public.prospects
        SET
          last_contact_date = $3,
          follow_up_due_date = CASE WHEN $5 THEN $4 ELSE COALESCE(follow_up_due_date, $4) END,
          status = CASE WHEN status = 'prospect' THEN 'contacted' ELSE status END,
          updated_at = now()
        WHERE id = $1 AND user_id = $2
      `, [row.prospect_id, userId, interactionIso, nextFollowUpIso, hasRequestedNextFollowUp || Boolean(row.suggested_next_follow_up)]);
      res.json({ interactionId, duplicate: false, nextFollowUp: nextFollowUpIso, newXpGained: xpForInteractionType('email') });
    } catch (error) {
      console.error('Error creating interaction from email review item:', error);
      res.status(500).json({ message: 'Failed to create interaction from email' });
    }
  });

  app.post('/api/broker-actions/log-activity', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }

      const BrokerActionSchema = z.object({
        prospectId: z.string().min(1),
        listingId: z.string().min(1).nullable().optional(),
        date: z.string().optional(),
        type: z.enum(['call', 'email', 'meeting', 'note']),
        outcome: z.enum(['contacted', 'no_answer', 'left_message', 'scheduled_meeting', 'not_interested', 'follow_up_later']).default('contacted'),
        notes: z.string().optional().default(''),
        nextFollowUp: z.string().nullable().optional(),
      });

      const parsed = BrokerActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid broker action data', error: parsed.error.errors });
      }

      const action = parsed.data;
      if (action.listingId) {
        await requireEditAccess(req, action.listingId);
      } else if (isDemo(req)) {
        const existing = await demo.getProspectAny(action.prospectId);
        if (!existing) {
          return res.status(404).json({ message: 'Prospect not found' });
        }
      } else {
        const existing = await storage.getProspect(action.prospectId, userId);
        if (!existing) {
          return res.status(404).json({ message: 'Prospect not found' });
        }
      }

      const interactionData = {
        userId,
        prospectId: action.prospectId,
        listingId: action.listingId || null,
        date: action.date || new Date().toISOString(),
        type: action.type,
        outcome: action.outcome,
        notes: action.notes || '',
        nextFollowUp: action.nextFollowUp || null,
      };

      if (isDemo(req)) {
        const created = { id: randomUUID(), ...interactionData, createdAt: new Date().toISOString() };
        await demo.addInteraction(userId, created);
        const prospectPatch: Record<string, any> = {
          lastContactDate: interactionData.date,
        };
        if (action.nextFollowUp !== undefined) {
          prospectPatch.followUpDueDate = action.nextFollowUp;
        }
        if (action.type !== 'note') {
          const existing = await demo.getProspectAny(action.prospectId);
          if (existing?.status === 'prospect') {
            prospectPatch.status = 'contacted';
          }
        }
        const updated = await demo.updateProspect(userId, action.prospectId, prospectPatch);
        return res.json({
          interaction: created,
          prospect: updated,
          newXpGained: xpForInteractionType(action.type),
        });
      }

      const interaction = await storage.createContactInteraction(interactionData);
      const prospectPatch: Record<string, any> = {
        lastContactDate: interactionData.date,
      };
      if (action.nextFollowUp !== undefined) {
        prospectPatch.followUpDueDate = action.nextFollowUp;
      }
      if (action.type !== 'note') {
        const existing = await storage.getProspect(action.prospectId, userId);
        if (existing?.status === 'prospect') {
          prospectPatch.status = 'contacted';
        }
      }

      const updateResult = await storage.updateProspect(action.prospectId, userId, prospectPatch, { skipXp: true });
      res.json({
        interaction,
        prospect: updateResult?.prospect,
        newXpGained: xpForInteractionType(action.type),
      });
    } catch (error) {
      console.error('Error logging broker action:', error);
      res.status(500).json({ message: 'Failed to log broker action' });
    }
  });

  type SalesBriefAction = {
    id: string;
    type: 'follow_up_due' | 'stale_prospect' | 'listing_progress' | 'email_cleanup' | 'research_target' | 'outlook_signal';
    priority: 'critical' | 'high' | 'medium' | 'low';
    priorityScore: number;
    title: string;
    reason: string;
    suggestedAction: string;
    source: 'level_cre' | 'email_review' | 'listing' | 'outlook';
    dueAt?: string | null;
    prospect?: Record<string, unknown> | null;
    listing?: Record<string, unknown> | null;
    email?: Record<string, unknown> | null;
    automationHints?: Record<string, unknown>;
  };

  function normalizeBriefDate(value: unknown): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function briefIso(value: unknown): string | null {
    const date = normalizeBriefDate(value);
    return date ? date.toISOString() : null;
  }

  function daysUntil(value: unknown, now = new Date()): number | null {
    const date = normalizeBriefDate(value);
    if (!date) return null;
    return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  }

  function daysSince(value: unknown, now = new Date()): number | null {
    const date = normalizeBriefDate(value);
    if (!date) return null;
    return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  }

  function prospectBriefName(row: any): string {
    return row.contact_company || row.business_name || row.name || 'Untitled prospect';
  }

  function briefPriority(score: number): SalesBriefAction['priority'] {
    if (score >= 90) return 'critical';
    if (score >= 70) return 'high';
    if (score >= 45) return 'medium';
    return 'low';
  }

  function uniqueBriefActions(actions: SalesBriefAction[]): SalesBriefAction[] {
    const seen = new Set<string>();
    const result: SalesBriefAction[] = [];
    for (const action of actions.sort((left, right) => right.priorityScore - left.priorityScore)) {
      const key = `${action.type}:${action.prospect?.id || ''}:${action.listing?.id || ''}:${action.email?.id || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(action);
    }
    return result;
  }

  type OutlookBriefSignal = {
    id: string;
    priority: SalesBriefAction['priority'];
    priorityScore: number;
    stage: 'needs_response' | 'waiting_on_reply' | 'active_work' | 'stale_work';
    title: string;
    reason: string;
    suggestedAction: string;
    lastActivityAt: string | null;
    lastOutboundAt: string | null;
    lastInboundAt: string | null;
    outboundCount: number;
    inboundCount: number;
    participantEmails: string[];
    propertyMentions: string[];
    dealTerms: string[];
    watchTerms: string[];
    latestEmail: Record<string, unknown> | null;
    sourceUrls: string[];
  };

  const OUTLOOK_DEAL_TERMS = [
    'offer',
    'signed',
    'signature',
    'loi',
    'lease',
    'purchase',
    'psa',
    'counter',
    'buyer',
    'tenant',
    'tour',
    'showing',
    'listing',
    'commission',
    'closing',
    'condition',
    'due diligence',
    'possession',
  ];

  function normalizeOutlookSubject(subject: unknown): string {
    return String(subject || '')
      .toLowerCase()
      .replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '')
      .replace(/\s+/g, ' ')
      .trim() || '(no subject)';
  }

  function normalizeBriefText(value: unknown): string {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function messageActivityAt(row: any): Date | null {
    return normalizeBriefDate(row.sent_at || row.received_at || row.created_at);
  }

  function parseWatchTerms(value: unknown): string[] {
    const envTerms = String(process.env.LEVELCRE_AUTOMATION_WATCH_TERMS || '')
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean);
    const queryTerms = Array.isArray(value)
      ? value.flatMap((item) => String(item).split(','))
      : String(value || '').split(',');
    return Array.from(new Set([...envTerms, ...queryTerms]
      .map((term) => normalizeBriefText(term))
      .filter((term) => term.length >= 2)));
  }

  function extractPropertyMentions(text: string): string[] {
    const mentions = new Set<string>();
    const patterns = [
      /\b\d{3,6}\s+\d{1,3}\s*(?:st|street|ave|avenue|av|rd|road)?\b/gi,
      /\b\d{3,6}\s+(?:[a-z0-9.'-]+\s+){0,5}(?:st|street|ave|avenue|av|rd|road|dr|drive|blvd|boulevard|trail|trl|way|cres|crescent|gate|place|pl|court|ct|parsons)\b/gi,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const mention = match[0].replace(/\s+/g, ' ').trim();
        if (mention.length >= 6) mentions.add(mention);
      }
    }
    return Array.from(mentions).slice(0, 8);
  }

  function extractDealTerms(text: string): string[] {
    return OUTLOOK_DEAL_TERMS.filter((term) => text.includes(term));
  }

  function buildOutlookBriefSignals(rows: any[], options: { limit: number; now?: Date; watchTerms?: string[] }): OutlookBriefSignal[] {
    const now = options.now || new Date();
    const watchTerms = options.watchTerms || [];
    const groups = new Map<string, { key: string; normalizedSubject: string; messages: any[] }>();

    for (const row of rows) {
      const normalizedSubject = normalizeOutlookSubject(row.subject);
      const key = row.provider_thread_id || `subject:${normalizedSubject}`;
      if (!groups.has(key)) groups.set(key, { key, normalizedSubject, messages: [] });
      groups.get(key)!.messages.push(row);
    }

    const signals: OutlookBriefSignal[] = [];
    for (const group of groups.values()) {
      const messages = group.messages
        .map((message) => ({ ...message, activityAt: messageActivityAt(message) }))
        .filter((message) => message.activityAt)
        .sort((left, right) => right.activityAt.getTime() - left.activityAt.getTime());
      if (messages.length === 0) continue;

      const latest = messages[0];
      const outbound = messages.filter((message) => message.direction === 'sent');
      const inbound = messages.filter((message) => message.direction === 'received');
      const lastOutbound = outbound[0]?.activityAt || null;
      const lastInbound = inbound[0]?.activityAt || null;
      const lastActivity = latest.activityAt;
      const text = normalizeBriefText(messages.map((message) => [
        message.subject,
        message.snippet,
        message.sender_email,
        ...(message.recipient_emails || []),
        ...(message.cc_emails || []),
      ].filter(Boolean).join(' ')).join(' '));
      const propertyMentions = extractPropertyMentions(text);
      const dealTerms = extractDealTerms(text);
      const matchedWatchTerms = watchTerms.filter((term) => text.includes(term));
      const participantEmails = Array.from(new Set(messages.flatMap((message) => [
        message.sender_email,
        ...(message.recipient_emails || []),
        ...(message.cc_emails || []),
      ]).filter(Boolean).map((email) => String(email).toLowerCase()))).slice(0, 12);
      const sourceUrls = Array.from(new Set(messages.map((message) => message.source_url).filter(Boolean))).slice(0, 5);

      const latestIsInbound = latest.direction === 'received';
      const latestIsOutbound = latest.direction === 'sent';
      const daysIdle = daysSince(lastActivity, now) || 0;
      const daysSinceOutbound = lastOutbound ? daysSince(lastOutbound, now) : null;
      const waitingOnReply = Boolean(lastOutbound && (!lastInbound || lastOutbound.getTime() > lastInbound.getTime()));
      const needsResponse = Boolean(lastInbound && (!lastOutbound || lastInbound.getTime() > lastOutbound.getTime()));
      const hasStrongContext = propertyMentions.length > 0 || dealTerms.length > 0 || matchedWatchTerms.length > 0;

      let score = 28 + Math.min(outbound.length * 8, 28) + Math.min(inbound.length * 4, 16);
      score += Math.min(propertyMentions.length * 8, 18);
      score += Math.min(dealTerms.length * 5, 24);
      score += Math.min(matchedWatchTerms.length * 16, 32);
      if (needsResponse) score += 24;
      if (waitingOnReply && daysSinceOutbound !== null && daysSinceOutbound >= 2) {
        score += 18 + Math.min(daysSinceOutbound * 3, 24);
      }
      if (latestIsOutbound && daysIdle >= 7) score += 10;
      if (!hasStrongContext && outbound.length < 2) score -= 18;
      score = Math.max(20, Math.min(score, 98));

      const stage: OutlookBriefSignal['stage'] = needsResponse
        ? 'needs_response'
        : waitingOnReply && daysSinceOutbound !== null && daysSinceOutbound >= 2
          ? 'waiting_on_reply'
          : daysIdle >= 14
            ? 'stale_work'
            : 'active_work';
      const titleContext = propertyMentions[0] || matchedWatchTerms[0] || group.normalizedSubject;
      const title = stage === 'needs_response'
        ? `Reply needed: ${titleContext}`
        : stage === 'waiting_on_reply'
          ? `Follow up sent thread: ${titleContext}`
          : stage === 'stale_work'
            ? `Revive Outlook thread: ${titleContext}`
            : `Active Outlook work: ${titleContext}`;
      const reason = stage === 'needs_response'
        ? 'Latest useful signal is an inbound email after your last sent message.'
        : stage === 'waiting_on_reply'
          ? `You sent the latest email ${daysSinceOutbound} day${daysSinceOutbound === 1 ? '' : 's'} ago and no newer reply is stored.`
          : stage === 'stale_work'
            ? `This thread has ${outbound.length} sent email${outbound.length === 1 ? '' : 's'} but no stored movement for ${daysIdle} days.`
            : `Recent sent-mail activity suggests this is active work, with ${outbound.length} outbound touch${outbound.length === 1 ? '' : 'es'}.`;
      const suggestedAction = stage === 'needs_response'
        ? 'Open the latest Outlook message, reply or decide the next step, then let Level CRE log the outcome.'
        : stage === 'waiting_on_reply'
          ? 'Send a concise follow-up or call the decision maker, then mark whether this is still live.'
          : stage === 'stale_work'
            ? 'Decide whether to revive, replace the buyer/contact, or archive this as dead pipeline.'
            : 'Review the thread and decide whether it should become a Level CRE prospect, listing action, or follow-up.';

      signals.push({
        id: `outlook:${group.key}`,
        priority: briefPriority(score),
        priorityScore: score,
        stage,
        title,
        reason,
        suggestedAction,
        lastActivityAt: briefIso(lastActivity),
        lastOutboundAt: briefIso(lastOutbound),
        lastInboundAt: briefIso(lastInbound),
        outboundCount: outbound.length,
        inboundCount: inbound.length,
        participantEmails,
        propertyMentions,
        dealTerms,
        watchTerms: matchedWatchTerms,
        latestEmail: latest ? {
          id: latest.id,
          subject: latest.subject || '',
          direction: latest.direction,
          sender: latest.sender_name || latest.sender_email || '',
          sentAt: briefIso(latest.sent_at || latest.received_at || latest.created_at),
          snippet: latest.snippet || '',
          sourceUrl: latest.source_url || '',
        } : null,
        sourceUrls,
      });
    }

    return signals
      .sort((left, right) => right.priorityScore - left.priorityScore)
      .slice(0, options.limit);
  }

  async function getOutlookBriefRows(userId: string, days: number, rowLimit = 1000) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await pool.query(`
      SELECT
        id,
        provider_thread_id,
        provider_message_id,
        mailbox,
        direction,
        subject,
        sender_email,
        sender_name,
        recipient_emails,
        cc_emails,
        sent_at,
        received_at,
        snippet,
        source_url,
        created_at
      FROM public.email_messages
      WHERE user_id = $1
        AND provider = 'outlook'
        AND COALESCE(sent_at, received_at, created_at) >= $2
      ORDER BY COALESCE(sent_at, received_at, created_at) DESC
      LIMIT $3
    `, [userId, since, rowLimit]);
    return result.rows;
  }

  app.get('/api/automation/outlook-brief', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const now = new Date();
      const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 365);
      const limit = Math.min(Math.max(Number(req.query.limit) || 12, 3), 50);
      const watchTerms = parseWatchTerms(req.query.watch);
      if (isDemo(req)) {
        return res.json({
          generatedAt: now.toISOString(),
          days,
          summary: {
            signals: 0,
            needsResponse: 0,
            waitingOnReply: 0,
            activeWork: 0,
            staleWork: 0,
          },
          watchTerms,
          signals: [],
          nextBestSignal: null,
          automationNotes: [
            'Demo mode does not read production Outlook activity.',
          ],
        });
      }

      const rows = await getOutlookBriefRows(userId, days);
      const signals = buildOutlookBriefSignals(rows, { limit, now, watchTerms });
      res.json({
        generatedAt: now.toISOString(),
        days,
        summary: {
          emailsAnalyzed: rows.length,
          signals: signals.length,
          needsResponse: signals.filter((signal) => signal.stage === 'needs_response').length,
          waitingOnReply: signals.filter((signal) => signal.stage === 'waiting_on_reply').length,
          activeWork: signals.filter((signal) => signal.stage === 'active_work').length,
          staleWork: signals.filter((signal) => signal.stage === 'stale_work').length,
        },
        watchTerms,
        signals,
        nextBestSignal: signals[0] || null,
        automationNotes: [
          'This endpoint treats Outlook sent mail as the strongest signal for current sales work.',
          'Pass comma-separated watch terms in the watch query parameter for known deal names, addresses, companies, or listing names.',
        ],
      });
    } catch (error) {
      console.error('Error building Outlook automation brief:', error);
      res.status(500).json({ message: 'Failed to build Outlook brief' });
    }
  });

  app.get('/api/automation/sales-brief', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const limit = Math.min(Math.max(Number(req.query.limit) || 12, 3), 25);
      const now = new Date();
      if (isDemo(req)) {
        return res.json({
          generatedAt: now.toISOString(),
          summary: {
            openActions: 0,
            dueFollowUps: 0,
            staleProspects: 0,
            listingProgressItems: 0,
            emailCleanupItems: 0,
          },
          actions: [],
          buckets: { doToday: [], thisWeek: [], cleanup: [], research: [] },
          nextBestAction: null,
          automationNotes: [
            'Demo mode does not read production prospects or inbox captures.',
          ],
        });
      }

      const watchTerms = parseWatchTerms(req.query.watch);
      const [prospectsResult, listingsResult, emailResult, outlookRows] = await Promise.all([
        pool.query(`
          SELECT
            p.id,
            p.name,
            p.status,
            p.address,
            p.last_contact_date,
            p.follow_up_due_date,
            p.contact_name,
            p.contact_email,
            p.contact_phone,
            p.contact_company,
            p.business_name,
            p.website_url,
            p.created_at,
            p.updated_at,
            MAX(ci.created_at) AS last_interaction_at,
            COUNT(ci.id)::int AS interaction_count,
            array_remove(array_agg(DISTINCT l.title), NULL) AS listing_titles
          FROM public.prospects p
          LEFT JOIN public.contact_interactions ci
            ON ci.prospect_id = p.id AND ci.user_id = p.user_id
          LEFT JOIN public.listing_prospects lp
            ON lp.prospect_id = p.id
          LEFT JOIN public.listings l
            ON l.id = lp.listing_id AND l.archived_at IS NULL
          WHERE p.user_id = $1
            AND COALESCE(p.status, '') <> 'no_go'
          GROUP BY p.id
          ORDER BY COALESCE(p.follow_up_due_date, MAX(ci.created_at), p.updated_at, p.created_at) ASC
          LIMIT 200
        `, [userId]),
        pool.query(`
          SELECT
            l.id,
            l.title,
            l.address,
            l.deal_type,
            l.size,
            l.price,
            l.created_at,
            COUNT(DISTINCT lp.prospect_id)::int AS prospect_count,
            MAX(ci.created_at) AS last_activity_at
          FROM public.listings l
          LEFT JOIN public.listing_prospects lp
            ON lp.listing_id = l.id
          LEFT JOIN public.contact_interactions ci
            ON ci.user_id = l.user_id AND (ci.listing_id = l.id OR ci.prospect_id = lp.prospect_id)
          WHERE l.user_id = $1
            AND l.archived_at IS NULL
          GROUP BY l.id
          ORDER BY COALESCE(MAX(ci.created_at), l.created_at) ASC
          LIMIT 50
        `, [userId]),
        pool.query(`
          SELECT
            epm.id AS match_id,
            epm.match_status,
            epm.created_at AS match_created_at,
            em.id AS email_id,
            em.subject,
            em.sender_email,
            em.sender_name,
            em.sent_at,
            em.received_at,
            em.snippet,
            p.id AS prospect_id,
            p.name AS prospect_name,
            p.contact_company AS prospect_contact_company,
            p.business_name AS prospect_business_name,
            l.id AS listing_id,
            l.title AS listing_title
          FROM public.email_prospect_matches epm
          JOIN public.email_messages em ON em.id = epm.email_message_id
          LEFT JOIN public.prospects p ON p.id = epm.prospect_id
          LEFT JOIN public.listings l ON l.id = epm.listing_id
          WHERE epm.user_id = $1
            AND epm.match_status IN ('needs_context', 'pending_review')
          ORDER BY COALESCE(em.sent_at, em.received_at, epm.created_at) DESC
          LIMIT 40
        `, [userId]),
        getOutlookBriefRows(userId, 90),
      ]);

      const actions: SalesBriefAction[] = [];

      for (const row of prospectsResult.rows) {
        const dueIn = daysUntil(row.follow_up_due_date, now);
        const lastTouch = row.last_contact_date || row.last_interaction_at || row.updated_at || row.created_at;
        const inactiveDays = daysSince(lastTouch, now);
        const name = prospectBriefName(row);
        const prospect = {
          id: row.id,
          name,
          status: row.status,
          address: row.address || null,
          contactName: row.contact_name || null,
          contactEmail: row.contact_email || null,
          contactPhone: row.contact_phone || null,
          listingTitles: row.listing_titles || [],
          lastTouch: briefIso(lastTouch),
          followUpDueDate: briefIso(row.follow_up_due_date),
        };

        if (dueIn !== null && dueIn <= 7) {
          const overdueBoost = dueIn < 0 ? Math.min(Math.abs(dueIn) * 4, 24) : 0;
          const score = 76 + overdueBoost + (row.status === 'listing' ? 12 : 0);
          actions.push({
            id: `followup:${row.id}`,
            type: 'follow_up_due',
            priority: briefPriority(score),
            priorityScore: score,
            title: dueIn < 0 ? `Overdue follow-up: ${name}` : `Upcoming follow-up: ${name}`,
            reason: dueIn < 0
              ? `Follow-up is ${Math.abs(dueIn)} day${Math.abs(dueIn) === 1 ? '' : 's'} overdue.`
              : `Follow-up is due in ${dueIn} day${dueIn === 1 ? '' : 's'}.`,
            suggestedAction: row.contact_phone
              ? 'Call first, then log the outcome and set the next follow-up.'
              : 'Send a short follow-up email, then log the outcome and set the next follow-up.',
            source: 'level_cre',
            dueAt: briefIso(row.follow_up_due_date),
            prospect,
            automationHints: {
              checkOutlookThread: Boolean(row.contact_email),
              enrichWithZoomInfo: !row.contact_phone || !row.contact_email,
            },
          });
        }

        const staleThreshold = row.status === 'listing' ? 7 : row.status === 'contacted' ? 14 : 30;
        if ((dueIn === null || dueIn > 7) && inactiveDays !== null && inactiveDays >= staleThreshold) {
          const score = Math.min(42 + inactiveDays + (row.status === 'listing' ? 18 : 0), 88);
          actions.push({
            id: `stale:${row.id}`,
            type: 'stale_prospect',
            priority: briefPriority(score),
            priorityScore: score,
            title: `Revive stale activity: ${name}`,
            reason: `No logged activity for ${inactiveDays} days while status is ${row.status}.`,
            suggestedAction: row.contact_phone
              ? 'Make a quick check-in call and decide whether this is still real pipeline.'
              : 'Find the best contact, send a check-in, and decide whether to keep this active.',
            source: 'level_cre',
            prospect,
            automationHints: {
              checkOutlookThread: Boolean(row.contact_email),
              enrichWithZoomInfo: !row.contact_phone || !row.contact_email,
            },
          });
        }

        if (!row.contact_phone && !row.contact_email && row.status !== 'no_go') {
          const score = row.status === 'listing' || row.status === 'contacted' ? 58 : 36;
          actions.push({
            id: `research:${row.id}`,
            type: 'research_target',
            priority: briefPriority(score),
            priorityScore: score,
            title: `Find a reachable contact: ${name}`,
            reason: 'Prospect is active but missing both phone and email contact details.',
            suggestedAction: 'Use ZoomInfo to find the likely decision maker and add direct contact info before outreach.',
            source: 'level_cre',
            prospect,
            automationHints: {
              enrichWithZoomInfo: true,
            },
          });
        }
      }

      for (const row of listingsResult.rows) {
        const inactiveDays = daysSince(row.last_activity_at || row.created_at, now);
        if (inactiveDays !== null && inactiveDays >= 7) {
          const score = Math.min(64 + inactiveDays + Math.min(Number(row.prospect_count || 0), 10), 92);
          actions.push({
            id: `listing:${row.id}`,
            type: 'listing_progress',
            priority: briefPriority(score),
            priorityScore: score,
            title: `Progress listing: ${row.title || row.address || 'Untitled listing'}`,
            reason: `${row.prospect_count || 0} linked prospect${Number(row.prospect_count || 0) === 1 ? '' : 's'} and no logged listing activity for ${inactiveDays} days.`,
            suggestedAction: 'Review the linked prospects, choose the next buyer/tenant call, and log a listing progress note.',
            source: 'listing',
            listing: {
              id: row.id,
              title: row.title,
              address: row.address || null,
              dealType: row.deal_type || null,
              prospectCount: Number(row.prospect_count || 0),
              lastActivityAt: briefIso(row.last_activity_at),
            },
            automationHints: {
              checkOutlookThread: true,
              enrichWithZoomInfo: Number(row.prospect_count || 0) < 5,
            },
          });
        }
      }

      for (const row of emailResult.rows) {
        const ageDays = daysSince(row.sent_at || row.received_at || row.match_created_at, now) || 0;
        const hasContext = Boolean(row.prospect_id || row.listing_id);
        const score = (hasContext ? 62 : 72) + Math.min(ageDays * 3, 18);
        actions.push({
          id: `email:${row.match_id}`,
          type: 'email_cleanup',
          priority: briefPriority(score),
          priorityScore: score,
          title: hasContext ? `Log captured email: ${row.subject || '(no subject)'}` : `Attach context to captured email: ${row.subject || '(no subject)'}`,
          reason: hasContext
            ? 'Captured email has context but has not been logged as a prospect interaction.'
            : 'Captured email needs prospect/listing context before it can become useful sales activity.',
          suggestedAction: hasContext
            ? 'Review the email, log it as an interaction, and set the next follow-up.'
            : 'Attach the right prospect/listing or create a new prospect, then log the next step.',
          source: 'email_review',
          email: {
            id: row.email_id,
            reviewId: row.match_id,
            subject: row.subject || '',
            sender: row.sender_name || row.sender_email || '',
            sentAt: briefIso(row.sent_at || row.received_at || row.match_created_at),
            snippet: row.snippet || '',
          },
          prospect: row.prospect_id ? {
            id: row.prospect_id,
            name: row.prospect_contact_company || row.prospect_business_name || row.prospect_name || '',
          } : null,
          listing: row.listing_id ? {
            id: row.listing_id,
            title: row.listing_title || '',
          } : null,
          automationHints: {
            checkOutlookThread: true,
            enrichWithZoomInfo: !hasContext,
          },
        });
      }

      const outlookSignals = buildOutlookBriefSignals(outlookRows, { limit: 8, now, watchTerms });
      for (const signal of outlookSignals) {
        actions.push({
          id: signal.id,
          type: 'outlook_signal',
          priority: signal.priority,
          priorityScore: signal.priorityScore,
          title: signal.title,
          reason: signal.reason,
          suggestedAction: signal.suggestedAction,
          source: 'outlook',
          email: signal.latestEmail,
          automationHints: {
            source: 'outlook_sent_and_inbox',
            stage: signal.stage,
            checkOutlookThread: true,
            enrichWithZoomInfo: signal.participantEmails.length > 0,
            createLevelCreRecord: true,
            participantEmails: signal.participantEmails,
            propertyMentions: signal.propertyMentions,
            dealTerms: signal.dealTerms,
            watchTerms: signal.watchTerms,
            sourceUrls: signal.sourceUrls,
          },
        });
      }

      const rankedActions = uniqueBriefActions(actions).slice(0, limit);
      const bucket = (predicate: (action: SalesBriefAction) => boolean) => rankedActions.filter(predicate);
      const dueFollowUps = rankedActions.filter((action) => action.type === 'follow_up_due');
      const staleProspects = rankedActions.filter((action) => action.type === 'stale_prospect');
      const listingProgressItems = rankedActions.filter((action) => action.type === 'listing_progress');
      const emailCleanupItems = rankedActions.filter((action) => action.type === 'email_cleanup');
      const outlookSignalItems = rankedActions.filter((action) => action.type === 'outlook_signal');

      res.json({
        generatedAt: now.toISOString(),
        summary: {
          openActions: rankedActions.length,
          dueFollowUps: dueFollowUps.length,
          staleProspects: staleProspects.length,
          listingProgressItems: listingProgressItems.length,
          emailCleanupItems: emailCleanupItems.length,
          outlookSignals: outlookSignalItems.length,
          researchTargets: rankedActions.filter((action) => action.type === 'research_target').length,
        },
        actions: rankedActions,
        buckets: {
          doToday: bucket((action) => action.priority === 'critical' || action.priority === 'high').slice(0, 7),
          thisWeek: bucket((action) => action.priority === 'medium').slice(0, 10),
          cleanup: bucket((action) => action.type === 'email_cleanup').slice(0, 10),
          research: bucket((action) => action.type === 'research_target').slice(0, 10),
          outlook: bucket((action) => action.type === 'outlook_signal').slice(0, 10),
        },
        nextBestAction: rankedActions[0] || null,
        outlook: {
          emailsAnalyzed: outlookRows.length,
          signals: outlookSignals,
          watchTerms,
        },
        automationNotes: [
          'Use this endpoint as the Level CRE source for daily Codex sales automations.',
          'Outlook sent mail is treated as a primary signal for active work when Level CRE records are incomplete.',
          'Codex should enrich actions with live Outlook thread context and ZoomInfo contact/company data before presenting a final daily action list.',
        ],
      });
    } catch (error) {
      console.error('Error building automation sales brief:', error);
      res.status(500).json({ message: 'Failed to build sales brief' });
    }
  });

  app.get('/api/tool-a/review/followups', requireAuth, async (req, res) => {
    try {
      const listingId = typeof req.query.listingId === 'string' ? req.query.listingId : undefined;
      const dueSoonDays = Math.min(parsePositiveIntParam(req.query.days, 7), 30);
      const includeAll =
        String(req.query.includeAll ?? '').toLowerCase() === 'true' ||
        String(req.query.includeAll ?? '') === '1';
      const prospects = await getToolAReviewProspects(req, listingId);
      const prospectIds = prospects.map((prospect) => prospect.id);
      const [interactions, workspacesByProspectId] = await Promise.all([
        getToolAReviewInteractions(req, prospectIds),
        getToolAReviewWorkspaces(req, prospectIds, listingId),
      ]);

      const review = buildFollowUpReview({
        prospects,
        interactions,
        workspacesByProspectId,
        dueSoonDays,
        includeAll,
      });

      res.json({
        generatedAt: new Date().toISOString(),
        listingId: listingId ?? null,
        daysWindow: dueSoonDays,
        ...review,
      });
    } catch (error: any) {
      console.error('Error building Tool A follow-up review:', error);
      res.status(error?.status || 500).json({ message: 'Failed to build Tool A follow-up review' });
    }
  });

  app.get('/api/tool-a/review/data-quality', requireAuth, async (req, res) => {
    try {
      const listingId = typeof req.query.listingId === 'string' ? req.query.listingId : undefined;
      const includeClean =
        String(req.query.includeClean ?? '').toLowerCase() === 'true' ||
        String(req.query.includeClean ?? '') === '1';
      const prospects = await getToolAReviewProspects(req, listingId);
      const prospectIds = prospects.map((prospect) => prospect.id);
      const [interactions, workspacesByProspectId] = await Promise.all([
        getToolAReviewInteractions(req, prospectIds),
        getToolAReviewWorkspaces(req, prospectIds, listingId),
      ]);

      const review = buildDataQualityReview({
        prospects,
        interactions,
        workspacesByProspectId,
        includeClean,
      });

      res.json({
        generatedAt: new Date().toISOString(),
        listingId: listingId ?? null,
        ...review,
      });
    } catch (error: any) {
      console.error('Error building Tool A data quality review:', error);
      res.status(error?.status || 500).json({ message: 'Failed to build Tool A data quality review' });
    }
  });

  // Broker Skills Routes
  app.get('/api/stats/header', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const qUser = ((req.query.userId as string) || 'me').toLowerCase();
      if (qUser !== 'me' && qUser !== userId) {
        // Only self queries supported; deny others
        return res.status(403).json({ message: 'Forbidden' });
      }

      // Helper: does a table exist?
      const tableExists = async (name: string): Promise<boolean> => {
        try {
          const { rows } = await pool.query(`SELECT to_regclass('public.' || $1) AS oid`, [name]);
          const oid = rows?.[0]?.oid;
          return Boolean(oid);
        } catch {
          return false;
        }
      };

      // Compute level and streak from existing skills source
      const levelFromXp = (xp: number) => Math.min(99, Math.floor(Math.sqrt(xp / 100)));
      const edmTz = 'America/Edmonton';
      const followUpCountActions = new Set([
        'call',
        'email',
        'meeting',
        'phone_call',
        'email_sent',
        'meeting_held',
        'followup_logged',
        'interaction',
        'note_added',
      ]);
      const getDatePartsInTimeZone = (date: Date, timeZone: string) => {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(date);
        const get = (type: 'year' | 'month' | 'day') => Number(parts.find((p) => p.type === type)?.value || '0');
        return { year: get('year'), month: get('month'), day: get('day') };
      };
      const getWeekKeyInTimeZone = (date: Date, timeZone: string) => {
        const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
        const localDateAsUtc = new Date(Date.UTC(year, month - 1, day));
        const dow = localDateAsUtc.getUTCDay();
        const diffToMonday = dow === 0 ? -6 : 1 - dow;
        localDateAsUtc.setUTCDate(localDateAsUtc.getUTCDate() + diffToMonday);
        return `${localDateAsUtc.getUTCFullYear()}-${String(localDateAsUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(localDateAsUtc.getUTCDate()).padStart(2, '0')}`;
      };
      const currentWeekKey = getWeekKeyInTimeZone(new Date(), edmTz);
      let totalLevel = 0;
      let streakDays = 0;
      let demoProspects: any[] = [];
      let demoInteractions: any[] = [];

      if (isDemo(req)) {
        const [prospects, interactions, requirements, comps] = await Promise.all([
          demo.getProspects(userId),
          demo.getInteractions(userId),
          demo.getRequirements(userId),
          demo.getMarketComps(userId),
        ]);
        demoProspects = prospects || [];
        demoInteractions = interactions || [];
        const prospectingXp = (prospects?.length || 0) * XP_VALUES.PROSPECTING;
        const followUpXp = (interactions || []).reduce((sum: number, i: any) => {
          if (i.type === 'call' || i.type === 'email' || i.type === 'meeting') {
            return sum + xpForInteractionType(i.type);
          }
          return sum + XP_VALUES.FOLLOW_UP_BASE; // note/other
        }, 0);
        const marketKnowledgeXp = ((requirements?.length || 0) + (comps?.length || 0)) * XP_VALUES.REQUIREMENT;
        const daysSet = new Set((interactions || []).map((i: any) => new Date(i.date || i.createdAt).toDateString()));
        streakDays = daysSet.size > 0 ? Math.min(daysSet.size, 99) : 0;
        const consistencyXp = streakDays * XP_VALUES.CONSISTENCY;
        totalLevel =
          levelFromXp(prospectingXp) +
          levelFromXp(followUpXp) +
          levelFromXp(consistencyXp) +
          levelFromXp(marketKnowledgeXp);
      } else {
        try {
          const skills = await storage.getBrokerSkills(userId);
          const p = skills?.prospecting || 0;
          const f = skills?.followUp || 0;
          const c = skills?.consistency || 0;
          const m = skills?.marketKnowledge || 0;
          streakDays = skills?.streakDays || 0;
          totalLevel = levelFromXp(p) + levelFromXp(f) + levelFromXp(c) + levelFromXp(m);
        } catch {
          totalLevel = 0;
          streakDays = 0;
        }
      }

      // Aggregations: prefer events; fallback to current tables
      let assetsTracked = 0;
      let followupsLogged = 0;

      if (isDemo(req)) {
        assetsTracked = demoProspects.length;
        followupsLogged = demoInteractions.filter((i: any) => {
          const date = new Date(i?.date || i?.createdAt || Date.now());
          if (getWeekKeyInTimeZone(date, edmTz) !== currentWeekKey) return false;
          const type = String(i?.type || '').toLowerCase();
          return followUpCountActions.has(type);
        }).length;
      } else {
        // Assets Tracked must be all-time count of prospects (not week-filtered).
        try {
          if (await tableExists('prospects')) {
            const r = await pool.query(
              `SELECT COUNT(*)::int AS c FROM prospects`
            );
            assetsTracked = r?.rows?.[0]?.c ?? 0;
          }
        } catch {}

        const hasEvents = await tableExists('events');
        if (hasEvents) {
          // events table is retained for diagnostics/legacy support; follow-ups counter now comes
          // from weekly skill activities to match the Broker Stats performance ring.
        }

        // Follow-Ups Logged: current Edmonton week, from skill activities when available.
        let followupsCountedFromActivities = false;
        try {
          if (await tableExists('skill_activities')) {
            const r = await pool.query(
              `SELECT timestamp, action
                 FROM skill_activities
                WHERE user_id = $1
                  AND skill_type = $2`,
              [userId, 'followUp']
            );
            const rows = r?.rows || [];
            followupsLogged = rows.filter((row: any) => {
              const action = String(row?.action || '').toLowerCase();
              if (!followUpCountActions.has(action)) return false;
              const ts = new Date(row?.timestamp || Date.now());
              return getWeekKeyInTimeZone(ts, edmTz) === currentWeekKey;
            }).length;
            followupsCountedFromActivities = true;
          }
        } catch {}

        if (!followupsCountedFromActivities) {
          // Fallbacks
          try {
            if (await tableExists('contact_interactions')) {
              const r = await pool.query(
                `SELECT date, type
                   FROM contact_interactions
                  WHERE user_id = $1`,
                [userId]
              );
              const rows = r?.rows || [];
              followupsLogged = rows.filter((row: any) => {
                const type = String(row?.type || '').toLowerCase();
                if (!followUpCountActions.has(type)) return false;
                const ts = new Date(row?.date || Date.now());
                return getWeekKeyInTimeZone(ts, edmTz) === currentWeekKey;
              }).length;
            } else if (await tableExists('touches')) {
              const r = await pool.query(
                `SELECT created_at, kind
                   FROM touches
                  WHERE user_id = $1`,
                [userId]
              );
              const rows = r?.rows || [];
              followupsLogged = rows.filter((row: any) => {
                const kind = String(row?.kind || '').toLowerCase();
                if (!followUpCountActions.has(kind)) return false;
                const ts = new Date(row?.created_at || Date.now());
                return getWeekKeyInTimeZone(ts, edmTz) === currentWeekKey;
              }).length;
            }
          } catch {}
        }
      }

      return res.json({ totalLevel, assetsTracked, followupsLogged, streakDays });
    } catch (error) {
      console.error('Error fetching stats header:', error);
      res.status(500).json({ message: 'Failed to fetch header stats' });
    }
  });
  app.get('/api/skills', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        // Compute demo skills from demo data
        const [prospects, interactions, requirements, comps] = await Promise.all([
          demo.getProspects(userId),
          demo.getInteractions(userId),
          demo.getRequirements(userId),
          demo.getMarketComps(userId),
        ]);

        const prospectingXp = (prospects?.length || 0) * XP_VALUES.PROSPECTING; // Add prospect

        const followUpXp = (interactions || []).reduce((sum: number, i: any) => {
          if (i.type === 'call' || i.type === 'email' || i.type === 'meeting') {
            return sum + xpForInteractionType(i.type);
          }
          return sum + XP_VALUES.FOLLOW_UP_BASE; // note/other
        }, 0);

        const marketKnowledgeXp = ((requirements?.length || 0) + (comps?.length || 0)) * XP_VALUES.REQUIREMENT;

        // Consistency XP per distinct active day
        const daysSet = new Set(
          (interactions || []).map((i: any) => new Date(i.date || i.createdAt).toDateString())
        );
        const streakDays = daysSet.size > 0 ? Math.min(daysSet.size, 99) : 0;
        const consistencyXp = streakDays * XP_VALUES.CONSISTENCY;
        const lastActivity = (interactions || []).length > 0
          ? new Date((interactions || [])[(interactions || []).length - 1].date || Date.now()).toISOString()
          : new Date().toISOString();

        return res.json({
          id: 'demo-skill',
          userId,
          prospecting: prospectingXp,
          followUp: followUpXp,
          consistency: consistencyXp,
          marketKnowledge: marketKnowledgeXp,
          lastActivity,
          streakDays,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      const skills = await storage.getBrokerSkills(userId);
      res.json(skills);
    } catch (error) {
      console.error('Error fetching broker skills:', error);
      res.status(500).json({ message: 'Failed to fetch broker skills' });
    }
  });

  // Diagnostics: check DB connectivity and required tables
  app.get('/api/_diag/db', async (req, res) => {
    // Hide diagnostics outside development to avoid schema leakage
    if (req.app.get('env') !== 'development') {
      return res.status(404).send('Not found');
    }
    try {
      await pool.query('SELECT 1');
      const required = [
        'users','profiles','prospects','submarkets','requirements','market_comps',
        'touches','contact_interactions','broker_skills','skill_activities'
      ];
      const { rows } = await pool.query(
        `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
      );
      const present = new Set(rows.map((r: any) => r.tablename));
      const missing = required.filter(t => !present.has(t));
      res.json({ ok: true, missing, present: Array.from(present) });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err.message });
    }
  });

  app.get('/api/skill-activities', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const limitRaw = (req.query.limit as string) || '';
      const limit = Math.max(1, Math.min(1500, Number.parseInt(limitRaw || '0') || 0)) || 50;
      if (isDemo(req)) {
        const [prospects, interactions, requirements, comps] = await Promise.all([
          demo.getProspects(userId),
          demo.getInteractions(userId),
          demo.getRequirements(userId),
          demo.getMarketComps(userId),
        ]);

        const interactionActivities = (interactions || []).map((i: any) => {
          const interactionType = (i.type === 'call' || i.type === 'email' || i.type === 'meeting') ? i.type : 'note';
          const action = (interactionType === 'note') ? 'note_added' : actionForInteractionType(interactionType);
          const xp = xpForInteractionType(interactionType);
          return {
            id: i.id,
            userId,
            skillType: 'followUp',
            action,
            xpGained: xp,
            timestamp: new Date(i.date || i.createdAt || Date.now()),
            relatedId: i.prospectId,
            multiplier: 1,
          };
        });

        const prospectActivities = (prospects || []).map((p: any) => ({
          id: p.id,
          userId,
          skillType: 'prospecting',
          action: 'add_prospect',
          xpGained: XP_VALUES.PROSPECTING,
          timestamp: new Date(p.createdAt || p.createdDate || Date.now()),
          relatedId: p.id,
          multiplier: 1,
        }));

        const requirementActivities = (requirements || []).map((r: any) => ({
          id: r.id,
          userId,
          skillType: 'marketKnowledge',
          action: 'add_requirement',
          xpGained: XP_VALUES.REQUIREMENT,
          timestamp: new Date(r.createdAt || Date.now()),
          relatedId: r.id,
          multiplier: 1,
        }));

        const compActivities = (comps || []).map((c: any) => ({
          id: c.id,
          userId,
          skillType: 'marketKnowledge',
          action: 'add_market_comp',
          xpGained: XP_VALUES.MARKET_COMP,
          timestamp: new Date(c.createdAt || Date.now()),
          relatedId: c.id,
          multiplier: 1,
        }));

        const activities = [
          ...interactionActivities,
          ...prospectActivities,
          ...requirementActivities,
          ...compActivities,
        ]
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, limit);

        return res.json(activities);
      }
      const activities = await storage.getSkillActivities(userId, limit);
      res.json(activities);
    } catch (error) {
      console.error('Error fetching skill activities:', error);
      res.status(500).json({ message: 'Failed to fetch skill activities' });
    }
  });

  app.post('/api/skill-activities', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      const activityData = {
        userId,
        skillType: req.body.skillType,
        action: req.body.action,
        xpGained: req.body.xpGained,
        relatedId: req.body.relatedId || null,
        multiplier: req.body.multiplier || 1
      };
      if (isDemo(req)) {
        return res.json({ id: randomUUID(), ...activityData, timestamp: new Date().toISOString() });
      }

      const activity = await storage.addSkillActivity(activityData);
      res.json(activity);
    } catch (error) {
      console.error('Error adding skill activity:', error);
      res.status(500).json({ message: 'Failed to add skill activity' });
    }
  });

  app.get('/api/leaderboard', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { orgId } = req.query;

      // Demo mode: synthesize a simple all-time leaderboard for two demo users
      if (isDemo(req)) {
        const demoUserId = 'demo-user';
        const rivalUserId = 'demo-user-2';

        // Ensure profiles exist
        const [demoProfile, rivalProfile] = await Promise.all([
          demo.getProfile(demoUserId),
          demo.getProfile(rivalUserId)
        ]);
        if (!demoProfile) {
          await demo.setProfile(demoUserId, { id: demoUserId, name: 'Demo User' });
        }
        if (!rivalProfile) {
          await demo.setProfile(rivalUserId, { id: rivalUserId, name: 'Teammate Two' });
        }

        // Seed minimal data for rival if empty
        const [rPros, rInts, rReqs, rComps] = await Promise.all([
          demo.getProspects(rivalUserId),
          demo.getInteractions(rivalUserId),
          demo.getRequirements(rivalUserId),
          demo.getMarketComps(rivalUserId),
        ]);
        if ((rPros?.length || 0) === 0 && (rInts?.length || 0) === 0 && (rReqs?.length || 0) === 0 && (rComps?.length || 0) === 0) {
          // Create a few seed items
          const now = Date.now();
          // Prospects
          for (let i = 0; i < 3; i++) {
            await demo.addProspect(rivalUserId, { id: `${rivalUserId}-p${i}`, name: `Rival Prospect ${i+1}`, createdAt: new Date(now - i*86400000).toISOString() });
          }
          // Interactions
          await demo.addInteraction(rivalUserId, { id: `${rivalUserId}-i1`, type: 'call', date: new Date(now - 3*86400000).toISOString() });
          await demo.addInteraction(rivalUserId, { id: `${rivalUserId}-i2`, type: 'email', date: new Date(now - 2*86400000).toISOString() });
          await demo.addInteraction(rivalUserId, { id: `${rivalUserId}-i3`, type: 'meeting', date: new Date(now - 1*86400000).toISOString() });
          // Requirements
          await demo.addRequirement(rivalUserId, { id: `${rivalUserId}-r1`, title: 'Tenant need 5k sf', createdAt: new Date(now - 4*86400000).toISOString() });
          await demo.addRequirement(rivalUserId, { id: `${rivalUserId}-r2`, title: 'Buyer search 2 acres', createdAt: new Date(now - 1*86400000).toISOString() });
          // Market comp
          await demo.addMarketComp(rivalUserId, { id: `${rivalUserId}-c1`, address: '123 Main St', createdAt: new Date(now - 5*86400000).toISOString() });
        }

        // Compute XP similar to skills endpoint
        // Match client level logic (L = floor(sqrt(xp/100)))
        const levelFromXp = (xp: number) => Math.min(99, Math.floor(Math.sqrt(xp / 100)));

        const compute = async (user: string) => {
          const [prospects, interactions, requirements, comps] = await Promise.all([
            demo.getProspects(user),
            demo.getInteractions(user),
            demo.getRequirements(user),
            demo.getMarketComps(user),
          ]);
          const prospectingXp = (prospects?.length || 0) * XP_VALUES.PROSPECTING;
          const followUpXp = (interactions || []).reduce((sum: number, i: any) => {
            if (i.type === 'call' || i.type === 'email' || i.type === 'meeting') {
              return sum + xpForInteractionType(i.type);
            }
            return sum + XP_VALUES.FOLLOW_UP_BASE; // note/other
          }, 0);
          const marketKnowledgeXp = ((requirements?.length || 0) + (comps?.length || 0)) * XP_VALUES.REQUIREMENT;
          // Consistency XP per distinct active day
          const daysSet = new Set(
            (interactions || []).map((i: any) => new Date(i.date || i.createdAt).toDateString())
          );
          const streakDays = daysSet.size > 0 ? Math.min(daysSet.size, 99) : 0;
          const consistencyXp = streakDays * XP_VALUES.CONSISTENCY;
          const level =
            levelFromXp(prospectingXp) +
            levelFromXp(followUpXp) +
            levelFromXp(consistencyXp) +
            levelFromXp(marketKnowledgeXp);
          return { prospectingXp, followUpXp, marketKnowledgeXp, consistencyXp, level };
        };

        const [demoStats, rivalStats, demoName, rivalName] = await Promise.all([
          compute(demoUserId),
          compute(rivalUserId),
          demo.getProfile(demoUserId).then(p => p?.name || 'Demo User'),
          demo.getProfile(rivalUserId).then(p => p?.name || 'Teammate Two'),
        ]);

        const data = [
          {
            user_id: demoUserId,
            user_email: 'demo@example.com',
            display_name: demoName,
            level_total: demoStats.level,
            xp_total: demoStats.prospectingXp + demoStats.followUpXp,
          },
          {
            user_id: rivalUserId,
            user_email: 'teammate@example.com',
            display_name: rivalName,
            level_total: rivalStats.level,
            xp_total: rivalStats.prospectingXp + rivalStats.followUpXp,
          },
        ].sort((a, b) => (b.level_total - a.level_total) || (b.xp_total - a.xp_total));

        return res.json({ data });
      }

      const leaderboard = await storage.getLeaderboard({
        userId,
        orgId: orgId as string,
        since: undefined,
      });

      res.json({ data: leaderboard });
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });

  registerIndustrialIntelRoutes(app);

  const httpServer = createServer(app);

  return httpServer;
}
