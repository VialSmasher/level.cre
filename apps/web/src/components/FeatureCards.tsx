import {
  BarChart3,
  Building2,
  CheckCircle2,
  Filter,
  MapPin,
  MoreHorizontal,
  Search,
} from 'lucide-react'

const opportunities = [
  { name: '156 Street Logistics', status: 'Touring', size: '42k sf', next: 'Jun 4', tone: 'emerald' },
  { name: 'Northgate Yard', status: 'Contacted', size: '18 ac', next: 'Jun 6', tone: 'amber' },
  { name: 'Acheson Crossdock', status: 'Prospect', size: '91k sf', next: 'Jun 11', tone: 'blue' },
]

const metrics = [
  { label: 'Live prospects', value: '84' },
  { label: 'Coverage', value: '68%' },
  { label: 'Follow-ups', value: '17' },
  { label: 'Pipeline', value: '$4.8M' },
]

const stageColors: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
}

export default function FeatureCards() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-200/70">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-blue-300" />
            level CRE
          </div>
          <div className="hidden items-center gap-5 text-xs text-slate-300 sm:flex">
            <span>Map</span>
            <span>Pipeline</span>
            <span>Analytics</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Edmonton
          </div>
        </div>

        <div className="grid min-h-[430px] grid-cols-1 lg:grid-cols-[220px_1fr]">
          <aside className="border-b border-slate-200 bg-slate-50 p-4 lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-500">Workspace</p>
                <h2 className="text-sm font-semibold text-slate-950">Industrial coverage</h2>
              </div>
              <MoreHorizontal className="h-4 w-4 text-slate-400" />
            </div>

            <div className="mb-4 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
              <Search className="h-3.5 w-3.5" />
              Search sites, owners, tenants
            </div>

            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">Active opportunities</span>
              <Filter className="h-3.5 w-3.5 text-slate-400" />
            </div>

            <div className="space-y-2">
              {opportunities.map((item) => (
                <div key={item.name} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold leading-4 text-slate-950">{item.name}</div>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${stageColors[item.tone]}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                    <span>{item.size}</span>
                    <span>Next: {item.next}</span>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="flex min-h-[430px] flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-500">Market map</p>
                <h2 className="text-sm font-semibold text-slate-950">West Edmonton submarket</h2>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600">
                <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                Analytics layer
              </div>
            </div>

            <div className="relative flex-1 overflow-hidden bg-[#edf1ee]">
              <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] [background-size:36px_36px]" />
              <div className="absolute -left-16 top-16 h-24 w-[110%] rotate-[31deg] bg-slate-300/45" />
              <div className="absolute left-24 top-0 h-[140%] w-7 rotate-[-34deg] bg-slate-300/55" />
              <div className="absolute right-10 top-4 h-[120%] w-6 rotate-[27deg] bg-white/70" />

              <div className="absolute left-[10%] top-[17%] h-24 w-40 rounded-md border border-blue-500 bg-blue-500/10" />
              <div className="absolute left-[29%] bottom-[14%] h-24 w-36 rotate-3 rounded-md border border-emerald-500 bg-emerald-500/10" />
              <div className="absolute right-[12%] top-[24%] h-20 w-32 -rotate-2 rounded-md border border-amber-500 bg-amber-500/10" />
              <div className="absolute right-[25%] bottom-[18%] h-20 w-28 rounded-md border border-slate-400 bg-white/25" />

              <div className="absolute left-[23%] top-[39%] h-3 w-3 rounded-full border-2 border-white bg-blue-600 shadow-md" />
              <div className="absolute right-[29%] top-[43%] h-3 w-3 rounded-full border-2 border-white bg-emerald-600 shadow-md" />
              <div className="absolute right-[18%] top-[29%] h-3 w-3 rounded-full border-2 border-white bg-amber-500 shadow-md" />
              <div className="absolute left-[45%] top-[58%] h-3 w-3 rounded-full border-2 border-white bg-slate-600 shadow-md" />

              <div className="absolute left-4 top-4 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">
                12.4M sf tracked
              </div>

              <div className="absolute bottom-4 left-4 right-4 rounded-md border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-900/5 backdrop-blur">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">156 Street Logistics</div>
                    <div className="text-xs text-slate-500">Tenant requirement matched to 3 candidate sites</div>
                  </div>
                  <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                    Touring
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-3 text-xs text-slate-500">
                  {metrics.map((metric) => (
                    <div key={metric.label}>
                      <div className="font-semibold text-slate-950">{metric.value}</div>
                      {metric.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-3 border-t border-slate-200 bg-white text-xs">
          <div className="border-r border-slate-200 px-4 py-3">
            <div className="font-semibold text-slate-950">Solo</div>
            <div className="text-slate-500">Broker workspace</div>
          </div>
          <div className="border-r border-slate-200 px-4 py-3">
            <div className="font-semibold text-slate-950">Team</div>
            <div className="text-slate-500">Shared market coverage</div>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-1 font-semibold text-slate-950">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Paid plans
            </div>
            <div className="text-slate-500">Stripe checkout ready</div>
          </div>
        </div>
      </div>
    </div>
  )
}
