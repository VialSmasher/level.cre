import { Button } from '@/components/ui/button'
import { ArrowRight, Building2, CheckCircle2, CreditCard, Users } from 'lucide-react'
import { useLocation } from 'wouter'

type Plan = {
  name: string
  price: string
  description: string
  checkoutUrl?: string
  features: string[]
  highlighted?: boolean
}

const plans: Plan[] = [
  {
    name: 'Solo Broker',
    price: '$49/mo',
    description: 'For individual brokers turning map coverage into a daily pipeline.',
    checkoutUrl: import.meta.env.VITE_STRIPE_SOLO_CHECKOUT_URL,
    features: ['Live saved prospects', 'Pipeline and follow-ups', 'Market coverage dashboard'],
  },
  {
    name: 'Team',
    price: '$149/mo',
    description: 'For small broker teams coordinating shared territories and client work.',
    checkoutUrl: import.meta.env.VITE_STRIPE_TEAM_CHECKOUT_URL,
    highlighted: true,
    features: ['Shared team workspace', 'Team seats and permissions', 'Exports and analytics'],
  },
  {
    name: 'Brokerage',
    price: 'Custom',
    description: 'For brokerages that need onboarding, admin controls, and custom support.',
    checkoutUrl: import.meta.env.VITE_STRIPE_BROKERAGE_CHECKOUT_URL,
    features: ['Custom onboarding', 'Dedicated workspace setup', 'Brokerage reporting'],
  },
]

function startCheckout(plan: Plan) {
  if (plan.checkoutUrl) {
    window.location.href = plan.checkoutUrl
    return
  }

  const subject = encodeURIComponent(`Level CRE ${plan.name} plan`)
  const body = encodeURIComponent(`I want to start the ${plan.name} plan.`)
  window.location.href = `mailto:support@example.com?subject=${subject}&body=${body}`
}

export default function Pricing() {
  const [, setLocation] = useLocation()

  return (
    <main className="min-h-screen bg-white bg-[linear-gradient(rgba(15,23,42,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.025)_1px,transparent_1px)] [background-size:28px_28px]">
      <div className="container mx-auto px-4 py-10 md:px-6 md:py-14 lg:px-8">
        <button
          type="button"
          onClick={() => setLocation('/')}
          className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowRight className="h-4 w-4 rotate-180" />
          Back to login
        </button>

        <section className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
            <CreditCard className="h-4 w-4" />
            Stripe checkout ready
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            Start in the sandbox, upgrade when the workspace becomes real.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Connect hosted Stripe checkout links for self-serve subscriptions, or route custom plans to the sales inbox.
          </p>
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-lg border bg-white p-5 shadow-sm ${
                plan.highlighted ? 'border-blue-300 shadow-blue-100' : 'border-slate-200'
              }`}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">{plan.name}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{plan.description}</p>
                </div>
                {plan.highlighted ? (
                  <Users className="h-5 w-5 text-blue-600" />
                ) : (
                  <Building2 className="h-5 w-5 text-slate-500" />
                )}
              </div>

              <div className="mb-5">
                <span className="text-3xl font-semibold text-slate-950">{plan.price}</span>
              </div>

              <ul className="mb-6 space-y-3 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => startCheckout(plan)}
                className={`w-full rounded-md ${
                  plan.highlighted
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-950 text-white hover:bg-slate-800'
                }`}
              >
                {plan.checkoutUrl ? 'Start checkout' : 'Contact to start'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
