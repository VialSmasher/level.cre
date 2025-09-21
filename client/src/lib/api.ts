const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
export const apiUrl = (p: string) => `${API_BASE}${p}`;
