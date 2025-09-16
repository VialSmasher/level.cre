// Utility for user-scoped localStorage operations
export const nsKey = (userId: string | null | undefined, key: string) =>
  userId ? `${key}::${userId}` : `${key}::guest`;

export const readJSON = <T>(k: string, def: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) as T : def;
  } catch {
    return def;
  }
};

export const writeJSON = (k: string, v: any) => 
  localStorage.setItem(k, JSON.stringify(v));

export const removeKey = (k: string) => 
  localStorage.removeItem(k);