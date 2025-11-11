// Centralized copy helpers for domain terms that might vary by deployment
// Defaults to Prospect/Prospects, but can be switched to Asset/Assets
// by setting VITE_USE_ASSETS_LABEL to '1' or 'true'.

function useAssetsLabel(): boolean {
  try {
    const raw = import.meta.env.VITE_USE_ASSETS_LABEL;
    return raw === '1' || String(raw).toLowerCase() === 'true';
  } catch {
    return false;
  }
}

export function prospectLabel(count?: number): string {
  const assets = useAssetsLabel();
  const plural = typeof count === 'number' ? count !== 1 : true;
  if (assets) return plural ? 'Assets' : 'Asset';
  return plural ? 'Prospects' : 'Prospect';
}

