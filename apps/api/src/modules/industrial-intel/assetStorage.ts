import { createClient } from "@supabase/supabase-js";
import type { IntelListingAsset } from "./repo";

const DEFAULT_BUCKET = "intel-assets";
const SIGNED_DOWNLOAD_SECONDS = 60 * 60;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export function getIntelAssetBucket() {
  return process.env.INTEL_ASSETS_BUCKET || DEFAULT_BUCKET;
}

export function isIntelAssetStorageConfigured() {
  return Boolean(getSupabaseAdmin());
}

export async function ensureIntelAssetBucket() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase Storage is not configured");
  }

  const bucket = getIntelAssetBucket();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if (buckets?.some((candidate) => candidate.name === bucket)) return bucket;

  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  } as any);
  if (error && !/already exists/i.test(String(error.message || error))) throw error;
  return bucket;
}

export async function createIntelAssetSignedUpload(path: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase Storage is not configured");
  }
  const bucket = await ensureIntelAssetBucket();
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw error || new Error("Failed to create signed upload URL");
  return {
    bucket,
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
  };
}

export async function signIntelListingAsset(asset: IntelListingAsset) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ...asset, signedUrl: null };
  const { data, error } = await supabase.storage
    .from(asset.storageBucket)
    .createSignedUrl(asset.storagePath, SIGNED_DOWNLOAD_SECONDS);
  return {
    ...asset,
    signedUrl: error ? null : data?.signedUrl || null,
  };
}

export async function signIntelListingAssets(assets: IntelListingAsset[]) {
  return Promise.all(assets.map((asset) => signIntelListingAsset(asset)));
}
