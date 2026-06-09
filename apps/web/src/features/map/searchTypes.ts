export type MapSearchLocation = {
  lat: number;
  lng: number;
  address: string;
  businessName?: string | null;
  websiteUrl?: string | null;
  contactPhone?: string | null;
  placeId?: string | null;
  googleMapsUrl?: string | null;
};

export type SearchProspectDetails = {
  businessName?: string;
  websiteUrl?: string;
  contactCompany?: string;
  contactPhone?: string;
  aiMetadata?: Record<string, unknown>;
};

const clean = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function searchLocationToProspectDetails(location: MapSearchLocation): SearchProspectDetails {
  const businessName = clean(location.businessName);
  const websiteUrl = clean(location.websiteUrl);
  const contactPhone = clean(location.contactPhone);
  const placeId = clean(location.placeId);
  const googleMapsUrl = clean(location.googleMapsUrl);
  const details: SearchProspectDetails = {};

  if (businessName) {
    details.businessName = businessName;
    details.contactCompany = businessName;
  }
  if (websiteUrl) details.websiteUrl = websiteUrl;
  if (contactPhone) details.contactPhone = contactPhone;
  if (placeId || googleMapsUrl) {
    details.aiMetadata = {
      googlePlace: {
        ...(placeId ? { placeId } : {}),
        ...(googleMapsUrl ? { googleMapsUrl } : {}),
      },
    };
  }

  return details;
}
