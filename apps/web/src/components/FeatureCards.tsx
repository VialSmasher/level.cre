import {
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  Download,
  MapPin,
  Send,
} from 'lucide-react'

const surveyProperties = [
  { name: '156 Street Logistics', type: 'Industrial', size: '42,000 sf', status: 'Touring' },
  { name: 'Northgate Yard', type: 'Land', size: '18 acres', status: 'Shortlist' },
  { name: 'Acheson Crossdock', type: 'Warehouse', size: '91,500 sf', status: 'Review' },
]

const activity = [
  { label: 'Requirements matched', value: '12' },
  { label: 'Survey views', value: '38' },
  { label: 'Client favorites', value: '7' },
]

export default function FeatureCards() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-300/50">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Building2 className="h-4 w-4 text-blue-600" />
            West Edmonton Industrial Survey
          </div>
          <div className="flex items-center gap-2">
            <button className="hidden rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </button>
            <button className="rounded-md bg-slate-950 px-3 py-1.5 text-xs font-medium text-white">
              <Send className="mr-1.5 inline h-3.5 w-3.5" />
              Share survey
            </button>
          </div>
        </div>

        <div className="grid min-h-[470px] grid-cols-1 lg:grid-cols-[1fr_300px]">
          <section className="relative min-h-[390px] overflow-hidden border-b border-slate-200 bg-[#edf1ee] lg:border-b-0 lg:border-r">
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:34px_34px]" />
            <div className="absolute left-[-18%] top-[21%] h-24 w-[128%] rotate-[32deg] bg-slate-300/45" />
            <div className="absolute left-[39%] top-[-14%] h-[140%] w-8 rotate-[-31deg] bg-slate-300/55" />
            <div className="absolute right-[13%] top-[-8%] h-[120%] w-7 rotate-[25deg] bg-white/75" />

            <div className="absolute left-[11%] top-[14%] h-28 w-44 rounded-sm border border-blue-500 bg-blue-500/10" />
            <div className="absolute left-[31%] bottom-[19%] h-28 w-40 rotate-3 rounded-sm border border-emerald-500 bg-emerald-500/10" />
            <div className="absolute right-[13%] top-[27%] h-24 w-36 -rotate-2 rounded-sm border border-amber-500 bg-amber-500/10" />
            <div className="absolute right-[31%] bottom-[15%] h-20 w-28 rounded-sm border border-slate-400 bg-white/25" />

            <MapPoint className="left-[24%] top-[39%] bg-blue-600" />
            <MapPoint className="right-[31%] top-[43%] bg-emerald-600" />
            <MapPoint className="right-[19%] top-[32%] bg-amber-500" />
            <MapPoint className="left-[48%] top-[61%] bg-slate-600" />

            <div className="absolute left-4 top-4 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">
              <MapPin className="mr-1.5 inline h-3.5 w-3.5 text-blue-600" />
              84 mapped opportunities
            </div>

            <div className="absolute bottom-4 left-4 right-4 rounded-md border border-slate-200 bg-white/95 p-4 shadow-lg shadow-slate-900/5 backdrop-blur">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-950">Client-ready survey package</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Live map, ranked properties, notes, files, and feedback in one shareable link.
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ready to send
                </div>
              </div>
            </div>
          </section>

          <aside className="bg-white p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Deal workspace
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Shortlist review</h2>
              </div>
              <div className="rounded-md border border-blue-100 bg-blue-50 p-2 text-blue-700">
                <BarChart3 className="h-4 w-4" />
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              {activity.map((item) => (
                <div key={item.label} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <div className="text-base font-semibold text-slate-950">{item.value}</div>
                  <div className="text-[10px] leading-3 text-slate-500">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {surveyProperties.map((property) => (
                <div key={property.name} className="rounded-md border border-slate-200 p-3">
                  <div className="mb-3 flex gap-3">
                    <div className="h-14 w-16 shrink-0 rounded-sm border border-slate-200 bg-[linear-gradient(135deg,#dfe7ef_0_45%,#c5d2df_45%_55%,#eef3f7_55%_100%)]" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-950">{property.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{property.type} · {property.size}</div>
                      <div className="mt-2 inline-flex rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
                        {property.status}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-md border border-slate-200 bg-slate-950 p-3 text-white">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="h-4 w-4 text-blue-300" />
                Next follow-up
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Call tenant rep on Jun 4 after shortlist feedback is submitted.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function MapPoint({ className }: { className: string }) {
  return (
    <div className={`absolute h-3.5 w-3.5 rounded-full border-2 border-white shadow-md ${className}`} />
  )
}
