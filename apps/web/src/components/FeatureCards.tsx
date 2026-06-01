import {
  BarChart3,
  Building2,
  CheckCircle2,
  CreditCard,
  MapPin,
  PhoneCall,
  Users,
} from 'lucide-react'

const pipeline = [
  { label: 'Prospect', count: 42, color: 'bg-blue-500' },
  { label: 'Contacted', count: 18, color: 'bg-amber-500' },
  { label: 'Touring', count: 7, color: 'bg-emerald-500' },
]

const benefits = [
  {
    icon: MapPin,
    title: 'Map sites fast',
    copy: 'Drop pins, draw parcels, and keep location context attached to every opportunity.',
  },
  {
    icon: PhoneCall,
    title: 'Move deals forward',
    copy: 'Track calls, tours, notes, requirements, and next steps from one broker workspace.',
  },
  {
    icon: CreditCard,
    title: 'Upgrade when ready',
    copy: 'Keep the demo open, then unlock live data, analytics, exports, and team seats.',
  },
]

export default function FeatureCards() {
  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-200/70">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-blue-300" />
            Edmonton Industrial
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Live workspace
          </div>
        </div>

        <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-[1fr_260px]">
          <div className="relative min-h-[320px] overflow-hidden bg-[#eef3f2]">
            <div className="absolute inset-0 bg-[linear-gradient(35deg,transparent_0_44%,rgba(148,163,184,0.65)_45%,transparent_46%_100%),linear-gradient(115deg,transparent_0_54%,rgba(148,163,184,0.45)_55%,transparent_56%_100%)]" />
            <div className="absolute left-8 top-8 h-32 w-48 rounded-lg border-2 border-blue-500/80 bg-blue-500/10" />
            <div className="absolute bottom-16 left-24 h-28 w-36 rotate-6 rounded-lg border-2 border-emerald-500/80 bg-emerald-500/10" />
            <div className="absolute right-14 top-20 h-24 w-36 -rotate-3 rounded-lg border-2 border-amber-500/80 bg-amber-500/10" />
            <div className="absolute bottom-10 right-20 h-24 w-28 rounded-lg border-2 border-slate-500/70 bg-white/20" />

            <div className="absolute left-[18%] top-[36%] rounded-full border-4 border-white bg-blue-600 p-2 shadow-lg">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <div className="absolute right-[32%] top-[48%] rounded-full border-4 border-white bg-emerald-600 p-2 shadow-lg">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <div className="absolute right-[18%] top-[24%] rounded-full border-4 border-white bg-amber-500 p-2 shadow-lg">
              <MapPin className="h-4 w-4 text-white" />
            </div>

            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
              <MapPin className="h-3.5 w-3.5 text-blue-600" />
              84 live prospects
            </div>
            <div className="absolute bottom-4 left-4 right-4 rounded-md border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-950">156 Street Logistics</div>
                <div className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  Touring
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
                <div>
                  <div className="font-semibold text-slate-900">42k sf</div>
                  Requirement
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Jun 4</div>
                  Follow-up
                </div>
                <div>
                  <div className="font-semibold text-slate-900">A+</div>
                  Fit score
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white p-4 md:border-l md:border-t-0">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase text-slate-500">Pipeline</div>
                <div className="text-lg font-semibold text-slate-950">Market coverage</div>
              </div>
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>

            <div className="space-y-3">
              {pipeline.map((stage) => (
                <div key={stage.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{stage.label}</span>
                    <span className="text-slate-500">{stage.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full ${stage.color}`}
                      style={{ width: `${Math.min(stage.count * 2, 92)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-md border border-blue-100 bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900">
                <Users className="h-4 w-4" />
                Team plan ready
              </div>
              <p className="text-xs leading-relaxed text-blue-800">
                Convert demo workspaces into paid plans for saved data, shared seats, exports, and analytics.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {benefits.map((benefit) => {
          const Icon = benefit.icon
          return (
            <div key={benefit.title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-slate-950">{benefit.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{benefit.copy}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Free sandbox
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Paid live workspace
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Monthly team subscriptions
        </span>
      </div>
    </div>
  )
}
