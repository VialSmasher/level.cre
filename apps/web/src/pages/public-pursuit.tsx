import { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { Activity, Building2, CalendarDays, MapPin, ShieldCheck, Users } from 'lucide-react';

import { AdvancedMapMarker } from '@/features/map/AdvancedMapMarker';
import { apiUrl } from '@/lib/api';
import { getGoogleMapsApiKey, getGoogleMapsMapId } from '@/lib/googleMapsApiKey';

type PublicProspect = {
  id: string | null;
  label: string;
  address: string | null;
  status: string;
  lat: number | null;
  lng: number | null;
  activityCount: number;
  lastActivityAt: string | null;
};

type PublicActivity = {
  id: string | null;
  prospectId: string | null;
  date: string | null;
  type: string;
  outcome: string | null;
};

type PublicPursuitSnapshot = {
  pursuit: {
    title: string;
    address: string | null;
    submarket: string | null;
    lat: number | null;
    lng: number | null;
    createdAt: string | null;
    preparedBy: string | null;
  };
  summary: {
    prospectCount: number;
    activityCount: number;
    lastActivityAt: string | null;
    activityByType: Record<string, number>;
  };
  prospects: PublicProspect[];
  activities: PublicActivity[];
  generatedAt: string;
};

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();
const GOOGLE_MAPS_MAP_ID = getGoogleMapsMapId();
const MAP_LIBRARIES: any = ['marker'];
const EDMONTON_CENTER = { lat: 53.5461, lng: -113.4938 };

const MAP_OPTIONS: google.maps.MapOptions = {
  mapId: GOOGLE_MAPS_MAP_ID,
  clickableIcons: false,
  fullscreenControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  gestureHandling: 'cooperative',
};

const cleanLabel = (value: string | null | undefined) => String(value || '')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDate = (value: string | null | undefined, includeYear = true) => {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';
  return date.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
};

const statusColor = (status: string) => {
  switch (status) {
    case 'client': return '#059669';
    case 'listing': return '#7C3AED';
    case 'contacted': return '#2563EB';
    case 'no_go': return '#64748B';
    default: return '#D97706';
  }
};

function PublicPursuitMap({
  snapshot,
  selectedProspectId,
  onSelectProspect,
}: {
  snapshot: PublicPursuitSnapshot;
  selectedProspectId: string | null;
  onSelectProspect: (prospectId: string) => void;
}) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
    mapIds: [GOOGLE_MAPS_MAP_ID],
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const mappedProspects = useMemo(
    () => snapshot.prospects.filter((prospect) => (
      prospect.id
      && prospect.lat !== null
      && prospect.lng !== null
    )),
    [snapshot.prospects],
  );
  const subjectPosition = snapshot.pursuit.lat !== null && snapshot.pursuit.lng !== null
    ? { lat: snapshot.pursuit.lat, lng: snapshot.pursuit.lng }
    : null;
  const fallbackCenter = subjectPosition || (mappedProspects[0]
    ? { lat: mappedProspects[0].lat!, lng: mappedProspects[0].lng! }
    : EDMONTON_CENTER);

  const onLoad = useCallback((nextMap: google.maps.Map) => setMap(nextMap), []);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const bounds = new google.maps.LatLngBounds();
    if (subjectPosition) bounds.extend(subjectPosition);
    mappedProspects.forEach((prospect) => bounds.extend({ lat: prospect.lat!, lng: prospect.lng! }));
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 60);
      if (mappedProspects.length <= 1) {
        google.maps.event.addListenerOnce(map, 'idle', () => {
          if ((map.getZoom() || 0) > 15) map.setZoom(15);
        });
      }
    }
  }, [isLoaded, map, mappedProspects, subjectPosition]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center bg-slate-100 px-8 text-center text-sm text-slate-600">
        The activity summary is available, but the map is not configured for this environment.
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="h-full min-h-80 animate-pulse bg-slate-100" aria-label="Loading pursuit map" />;
  }

  return (
    <GoogleMap
      mapContainerClassName="h-full min-h-80 w-full"
      center={fallbackCenter}
      zoom={subjectPosition ? 14 : 10}
      options={MAP_OPTIONS}
      onLoad={onLoad}
    >
      {subjectPosition ? (
        <AdvancedMapMarker
          position={subjectPosition}
          title={snapshot.pursuit.title}
          color="#0F172A"
          label="L"
          scale={11}
          markerKind="asset"
          markerCategory="listing"
        />
      ) : null}
      {mappedProspects.map((prospect) => (
        <AdvancedMapMarker
          key={prospect.id}
          position={{ lat: prospect.lat!, lng: prospect.lng! }}
          title={prospect.label}
          color={statusColor(prospect.status)}
          scale={9}
          markerId={prospect.id!}
          markerKind="asset"
          markerCategory="prospect"
          selected={selectedProspectId === prospect.id}
          onClick={() => onSelectProspect(prospect.id!)}
        />
      ))}
    </GoogleMap>
  );
}

function SummaryCard({ label, value, detail, icon }: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-sm text-slate-600">{detail}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{icon}</span>
      </div>
    </div>
  );
}

export default function PublicPursuit() {
  const [, params] = useRoute('/pursuits/share/:token');
  const token = params?.token || '';
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<PublicPursuitSnapshot>({
    queryKey: ['public-pursuit', token],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await fetch(apiUrl(`/api/public/pursuits/${encodeURIComponent(token)}`), {
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(response.status === 404 ? 'This activity link is unavailable.' : 'The activity view could not be loaded.');
      return response.json();
    },
  });

  const selectedProspect = data?.prospects.find((prospect) => prospect.id === selectedProspectId) || null;
  const prospectById = useMemo(
    () => new Map((data?.prospects || []).map((prospect) => [prospect.id, prospect])),
    [data?.prospects],
  );
  const visibleActivities = useMemo(
    () => selectedProspectId
      ? (data?.activities || []).filter((activity) => activity.prospectId === selectedProspectId)
      : (data?.activities || []),
    [data?.activities, selectedProspectId],
  );
  const visibleActivityByType = useMemo(() => visibleActivities.reduce<Record<string, number>>((counts, activity) => {
    const type = activity.type || 'activity';
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {}), [visibleActivities]);

  if (isLoading) {
    return <div className="min-h-screen animate-pulse bg-slate-100" aria-label="Loading client activity view" />;
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-slate-950">Activity link unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error instanceof Error ? error.message : 'Ask your broker for a current link.'}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight">level CRE</span>
            <span className="hidden h-5 w-px bg-slate-700 sm:block" />
            <span className="hidden text-sm text-slate-300 sm:block">Client activity view</span>
          </div>
          <div className="inline-flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Read only
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-5 py-7 sm:px-8 sm:py-10">
        <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Prospecting activity</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{data.pursuit.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
              {data.pursuit.address ? <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{data.pursuit.address}</span> : null}
              {data.pursuit.submarket ? <span>{data.pursuit.submarket}</span> : null}
              {data.pursuit.preparedBy ? <span>Prepared by {data.pursuit.preparedBy}</span> : null}
            </div>
          </div>
          <p className="text-xs text-slate-500">Updated {formatDate(data.generatedAt)}</p>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Pursuit activity summary">
          <SummaryCard label="Prospects" value={data.summary.prospectCount} detail="Mapped to this pursuit" icon={<Users className="h-5 w-5" />} />
          <SummaryCard label="Sales activity" value={data.summary.activityCount} detail="Calls, emails, meetings and notes" icon={<Activity className="h-5 w-5" />} />
          <SummaryCard label="Latest activity" value={formatDate(data.summary.lastActivityAt, false)} detail={data.summary.lastActivityAt ? 'Most recent recorded touch' : 'No recorded activity'} icon={<CalendarDays className="h-5 w-5" />} />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid min-h-[480px] lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.8fr)]">
            <div className="min-h-[420px] border-b border-slate-200 lg:border-b-0 lg:border-r">
              <PublicPursuitMap snapshot={data} selectedProspectId={selectedProspectId} onSelectProspect={setSelectedProspectId} />
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-semibold text-slate-950">Prospects</h2>
                <p className="mt-1 text-sm text-slate-600">Select a prospect to review its activity.</p>
              </div>
              {selectedProspect ? (
                <div className="border-b border-blue-100 bg-blue-50 px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Selected prospect</p>
                  <p className="mt-1 font-semibold text-slate-950">{selectedProspect.label}</p>
                  <p className="mt-1 text-sm text-slate-600">{selectedProspect.address || 'Address not available'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700">{cleanLabel(selectedProspect.status)}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700">{selectedProspect.activityCount} activities</span>
                    <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700">Last {formatDate(selectedProspect.lastActivityAt)}</span>
                  </div>
                </div>
              ) : null}
              <div className="max-h-[520px] flex-1 overflow-y-auto">
                {data.prospects.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-600">Prospects will appear here as the campaign develops.</div>
                ) : data.prospects.map((prospect) => (
                  <button
                    key={prospect.id || prospect.label}
                    type="button"
                    onClick={() => prospect.id && setSelectedProspectId((current) => current === prospect.id ? null : prospect.id)}
                    className={`flex w-full items-start gap-3 border-b border-slate-100 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-slate-50 ${selectedProspectId === prospect.id ? 'bg-blue-50/70' : ''}`}
                  >
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor(prospect.status) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{prospect.label}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{prospect.address || cleanLabel(prospect.status)}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-slate-500">{prospect.activityCount}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="font-semibold text-slate-950">{selectedProspect ? `${selectedProspect.label} activity` : 'Recent activity'}</h2>
              <p className="mt-1 text-sm text-slate-600">{selectedProspect ? 'Showing recorded work for the selected prospect.' : 'A read-only trail of prospecting work tied to this pursuit.'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedProspect ? (
                <button type="button" className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50" onClick={() => setSelectedProspectId(null)}>
                  Show all activity
                </button>
              ) : null}
              {Object.entries(visibleActivityByType).map(([type, count]) => (
                <span key={type} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{count} {cleanLabel(type)}</span>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {visibleActivities.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-600">{selectedProspect ? 'No recorded activity for this prospect yet.' : 'No recorded activity yet.'}</div>
            ) : visibleActivities.slice(0, 50).map((activity, index) => {
              const prospect = prospectById.get(activity.prospectId) || null;
              return (
                <div key={activity.id || `${activity.date}-${index}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[130px_130px_minmax(0,1fr)_160px] sm:items-center sm:px-6">
                  <span className="text-sm text-slate-600">{formatDate(activity.date)}</span>
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    <Activity className="h-3.5 w-3.5" />{cleanLabel(activity.type)}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-slate-900">{prospect?.label || 'Pursuit activity'}</span>
                  <span className="text-sm text-slate-600 sm:text-right">{cleanLabel(activity.outcome) || 'Recorded'}</span>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 py-4 text-xs text-slate-500 sm:flex-row">
          <span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4" />Powered by Level CRE</span>
          <span>Contact details, private notes and follow-ups are not included in this view.</span>
        </footer>
      </main>
    </div>
  );
}
