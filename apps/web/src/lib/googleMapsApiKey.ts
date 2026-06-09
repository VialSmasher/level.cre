export const getGoogleMapsApiKey = () => {
  const env = import.meta.env as ImportMetaEnv & {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
    GOOGLE_MAPS_API_KEY?: string;
  };

  return (
    env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
    env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    env.GOOGLE_MAPS_API_KEY?.trim() ||
    ''
  );
};

export const getGoogleMapsMapId = () => {
  const env = import.meta.env as ImportMetaEnv & {
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?: string;
    GOOGLE_MAPS_MAP_ID?: string;
  };

  return (
    env.VITE_GOOGLE_MAPS_MAP_ID?.trim() ||
    env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() ||
    env.GOOGLE_MAPS_MAP_ID?.trim() ||
    'DEMO_MAP_ID'
  );
};

export const GOOGLE_MAPS_API_KEY_HELP_TEXT =
  'Set VITE_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, or GOOGLE_MAPS_API_KEY.';
