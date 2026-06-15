import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Home,
  KeyRound,
  Link2,
  ReceiptText,
  Send,
  ShieldCheck,
  UserPlus,
  WalletCards,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createResidentLoyaltyDemoState } from './residentLoyaltyDemoData';
import {
  calculateOnboardingProgress,
  getResidentName,
  getResidentUnitLabel,
  getTenantLifecycle,
  onboardingStatusLabel,
} from './residentLoyaltyLogic';
import { loadResidentLoyaltyState, mergeResidentLoyaltyState, runResidentLoyaltyAction } from './residentLoyaltyApi';
import type { OnboardingStepStatus, ResidentOnboardingStep, TenantLifecycleRecord } from './types';

type IconType = ComponentType<{ className?: string }>;

const toDisplayDate = (iso: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(iso);
};

const formatDate = (iso?: string) =>
  iso ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(toDisplayDate(iso)) : 'Not set';

const statusTone: Record<OnboardingStepStatus, string> = {
  todo: 'border-stone-200 bg-stone-50 text-stone-700',
  in_progress: 'border-sky-200 bg-sky-50 text-sky-800',
  submitted: 'border-amber-300 bg-amber-50 text-amber-800',
  manager_review: 'border-violet-200 bg-violet-50 text-violet-800',
  complete: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

const lifecycleIcons: Array<{ label: string; icon: IconType; key: keyof TenantLifecycleRecord }> = [
  { label: 'Lease', icon: FileText, key: 'lease' },
  { label: 'Deposit', icon: ShieldCheck, key: 'securityDeposit' },
  { label: 'Move-in inspection', icon: ClipboardCheck, key: 'moveInInspection' },
  { label: 'Next rent', icon: ReceiptText, key: 'nextRent' },
];

function StatusBadge({ status }: { status: OnboardingStepStatus }) {
  return (
    <Badge variant="outline" className={statusTone[status]}>
      {onboardingStatusLabel(status)}
    </Badge>
  );
}

function SetupStep({
  icon: Icon,
  title,
  detail,
  active,
}: {
  icon: IconType;
  title: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${active ? 'border-[#f6c451] bg-[#fff3ce]' : 'border-stone-200 bg-white'}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${active ? 'bg-stone-950 text-[#f6c451]' : 'bg-stone-100 text-stone-700'}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 font-black text-stone-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{detail}</p>
    </div>
  );
}

export default function ResidentLoyaltySetupPage() {
  const [demo, setDemo] = useState(createResidentLoyaltyDemoState);
  const [selectedResidentId, setSelectedResidentId] = useState('resident-mateo-reyes');
  const [invitePreviewed, setInvitePreviewed] = useState(false);
  const [isDatabaseBacked, setIsDatabaseBacked] = useState(false);
  const [persistenceNote, setPersistenceNote] = useState('Public demo mode. Sign in to persist landlord and tenant records.');

  const building = demo.buildings[0];
  const landlord = demo.landlords[0];
  const residentOptions = demo.residents.filter((resident) => getTenantLifecycle(demo, resident.id));
  const selectedResident = demo.residents.find((resident) => resident.id === selectedResidentId) ?? residentOptions[0];
  const lifecycle = getTenantLifecycle(demo, selectedResident.id);
  const onboardingSteps = useMemo(
    () => demo.onboardingSteps.filter((step) => step.residentId === selectedResident.id),
    [demo.onboardingSteps, selectedResident.id],
  );
  const progress = calculateOnboardingProgress(demo, selectedResident.id);
  const portalUrl = lifecycle ? `https://app.livingrewards.com/${lifecycle.portalSlug}` : 'https://app.livingrewards.com/property/unit';

  useEffect(() => {
    let cancelled = false;

    async function loadPersistedState() {
      try {
        const payload = await loadResidentLoyaltyState();
        if (cancelled || !payload.state) return;
        setDemo((current) => mergeResidentLoyaltyState(current, payload.state));
        setIsDatabaseBacked(payload.source === 'database');
        setPersistenceNote(
          payload.source === 'database'
            ? 'Database-backed demo. Landlord, unit, tenant, lease, deposit, rent, and inspection records are persisted for this account.'
            : 'Public demo mode. Sign in to persist landlord and tenant records.',
        );
        const loadedResidents = payload.state.residents || [];
        const preferred = loadedResidents.find((resident) => resident.name === 'Mateo Reyes') || loadedResidents[0];
        if (preferred) setSelectedResidentId(preferred.id);
      } catch (_error) {
        if (!cancelled) {
          setIsDatabaseBacked(false);
          setPersistenceNote('Public demo mode. Sign in to persist landlord and tenant records.');
        }
      }
    }

    loadPersistedState();
    return () => {
      cancelled = true;
    };
  }, []);

  const syncPersistedAction = async (path: string) => {
    if (!isDatabaseBacked) return;
    try {
      const payload = await runResidentLoyaltyAction(path);
      if (payload.state) {
        setDemo((current) => mergeResidentLoyaltyState(current, payload.state));
      }
      setPersistenceNote('Saved to the resident loyalty database.');
    } catch (error: any) {
      setIsDatabaseBacked(false);
      setPersistenceNote(error?.message ? `Database save failed; continuing locally. ${error.message}` : 'Database save failed; continuing locally.');
    }
  };

  const updateStep = (stepId: string, status: OnboardingStepStatus) => {
    setDemo((current) => ({
      ...current,
      onboardingSteps: current.onboardingSteps.map((step) =>
        step.id === stepId
          ? {
              ...step,
              status,
              completedAt: status === 'complete' ? new Date().toISOString() : step.completedAt,
            }
          : step,
      ),
    }));
  };

  const markInviteSent = () => {
    setInvitePreviewed(true);
    setDemo((current) => ({
      ...current,
      tenantLifecycles: current.tenantLifecycles.map((record) =>
        record.residentId === selectedResident.id ? { ...record, inviteStatus: 'sent' } : record,
      ),
      onboardingSteps: current.onboardingSteps.map((step) =>
        step.residentId === selectedResident.id && step.type === 'tenant_invite_sent'
          ? { ...step, status: 'complete', completedAt: new Date().toISOString() }
          : step,
      ),
    }));
    void syncPersistedAction(`/api/resident-loyalty/residents/${selectedResident.id}/invite`);
  };

  const acceptInvite = () => {
    setDemo((current) => ({
      ...current,
      tenantLifecycles: current.tenantLifecycles.map((record) =>
        record.residentId === selectedResident.id ? { ...record, inviteStatus: 'accepted' } : record,
      ),
    }));
    void syncPersistedAction(`/api/resident-loyalty/residents/${selectedResident.id}/accept-invite`);
  };

  const markLeaseAcknowledged = () => {
    setDemo((current) => ({
      ...current,
      tenantLifecycles: current.tenantLifecycles.map((record) =>
        record.residentId === selectedResident.id
          ? {
              ...record,
              lease: {
                ...record.lease,
                status: 'acknowledged',
                acknowledgedAt: new Date().toISOString(),
              },
            }
          : record,
      ),
      onboardingSteps: current.onboardingSteps.map((step) =>
        step.residentId === selectedResident.id && step.type === 'lease_acknowledged'
          ? { ...step, status: 'complete', completedAt: new Date().toISOString() }
          : step,
      ),
    }));
    void syncPersistedAction(`/api/resident-loyalty/residents/${selectedResident.id}/lease-acknowledged`);
  };

  const submitInspectionForReview = () => {
    setDemo((current) => ({
      ...current,
      tenantLifecycles: current.tenantLifecycles.map((record) =>
        record.residentId === selectedResident.id
          ? {
              ...record,
              moveInInspection: {
                ...record.moveInInspection,
                status: 'manager_review',
                photoCount: Math.max(record.moveInInspection.photoCount, 8),
                issueCount: Math.max(record.moveInInspection.issueCount, 1),
                submittedAt: new Date().toISOString(),
              },
            }
          : record,
      ),
      onboardingSteps: current.onboardingSteps.map((step) =>
        step.residentId === selectedResident.id && step.type === 'move_in_inspection_completed'
          ? { ...step, status: 'manager_review' }
          : step,
      ),
    }));
    void syncPersistedAction(`/api/resident-loyalty/residents/${selectedResident.id}/inspection-submit`);
  };

  const completeInspectionReview = () => {
    setDemo((current) => ({
      ...current,
      tenantLifecycles: current.tenantLifecycles.map((record) =>
        record.residentId === selectedResident.id
          ? {
              ...record,
              moveInInspection: {
                ...record.moveInInspection,
                status: 'completed',
              },
            }
          : record,
      ),
      onboardingSteps: current.onboardingSteps.map((step) =>
        step.residentId === selectedResident.id && step.type === 'move_in_inspection_completed'
          ? { ...step, status: 'complete', completedAt: new Date().toISOString() }
          : step,
      ),
    }));
    void syncPersistedAction(`/api/resident-loyalty/residents/${selectedResident.id}/inspection-approve`);
  };

  const completeDepositStatus = () => {
    setDemo((current) => ({
      ...current,
      tenantLifecycles: current.tenantLifecycles.map((record) =>
        record.residentId === selectedResident.id
          ? {
              ...record,
              securityDeposit: {
                ...record.securityDeposit,
                status: 'confirmed',
                confirmedAt: new Date().toISOString(),
              },
            }
          : record,
      ),
      onboardingSteps: current.onboardingSteps.map((step) =>
        step.residentId === selectedResident.id && step.type === 'security_deposit_confirmed'
          ? { ...step, status: 'complete', completedAt: new Date().toISOString() }
          : step,
      ),
    }));
    void syncPersistedAction(`/api/resident-loyalty/residents/${selectedResident.id}/deposit-confirmed`);
  };

  const stepAction = (step: ResidentOnboardingStep) => {
    if (step.status === 'complete') return null;
    if (step.type === 'lease_acknowledged') {
      return <Button size="sm" variant="outline" onClick={markLeaseAcknowledged}>Acknowledge</Button>;
    }
    if (step.type === 'security_deposit_confirmed') {
      return <Button size="sm" variant="outline" onClick={completeDepositStatus}>Confirm status</Button>;
    }
    if (step.type === 'move_in_inspection_completed') {
      if (step.status === 'manager_review') {
        return <Button size="sm" variant="outline" onClick={completeInspectionReview}>Approve review</Button>;
      }
      return <Button size="sm" variant="outline" onClick={submitInspectionForReview}>Submit review</Button>;
    }
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          updateStep(step.id, 'complete');
          void syncPersistedAction(`/api/resident-loyalty/onboarding-steps/${step.id}/complete`);
        }}
      >
        Mark done
      </Button>
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-stone-950">
      <header className="border-b border-stone-200 bg-[#fbf9f3]/95 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-950 text-[#f6c451]">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black">Living Rewards</p>
              <p className="text-xs text-stone-600">PMS-lite tenant onboarding layer</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild className="border-stone-300 bg-white">
              <Link href="/resident-loyalty">
                Manager console
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button className="bg-stone-950 text-white hover:bg-stone-800" asChild>
              <Link href="/resident-loyalty/resident-demo">
                Resident portal
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
        <section className="grid gap-5 lg:grid-cols-[1fr_390px]">
          <div className="rounded-lg bg-stone-950 p-5 text-white shadow-xl md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[#f6c451] text-stone-950 hover:bg-[#f6c451]">PMS-lite, not full PMS</Badge>
              <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                {isDatabaseBacked ? 'Database-backed' : 'Frontend demo'}
              </Badge>
            </div>
            <h1 className="mt-5 max-w-4xl text-4xl font-black leading-none md:text-6xl">
              Landlords onboard tenants into a branded operations and rewards portal.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-white/70 md:text-lg">
              The landlord sets up the property, adds a unit and tenant, sends an invite, and tracks move-in readiness:
              lease packet acknowledgement, deposit confirmation, inspection photos, building notices, and first rent
              status. Payments, accounting, screening, and legal signing stay outside this MVP.
            </p>
            <div className="mt-7 grid gap-3 md:grid-cols-3">
              <SetupStep icon={Building2} title="1. Property" detail="Create landlord, building, units, and portal slug." active />
              <SetupStep icon={UserPlus} title="2. Invite" detail="Send a resident link for the correct unit and lease period." />
              <SetupStep icon={WalletCards} title="3. Rewards" detail="Tie move-in and operations tasks to positive points." />
            </div>
            <div className={`mt-5 rounded-lg border p-3 text-sm leading-6 ${
              isDatabaseBacked ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50' : 'border-white/15 bg-white/10 text-white/70'
            }`}>
              {persistenceNote}
            </div>
          </div>

          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Selected tenant</Badge>
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase text-stone-500">Resident</p>
                <Select
                  value={selectedResident.id}
                  onValueChange={(value) => {
                    setSelectedResidentId(value);
                    setInvitePreviewed(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {residentOptions.map((resident) => (
                      <SelectItem key={resident.id} value={resident.id}>
                        Unit {getResidentUnitLabel(demo, resident)} - {resident.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4">
                <p className="text-sm font-black text-stone-950">{selectedResident.name}</p>
                <p className="mt-1 text-sm text-stone-600">Unit {getResidentUnitLabel(demo, selectedResident)} at {building.name}</p>
                <p className="mt-1 text-sm text-stone-600">{selectedResident.email}</p>
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase text-stone-500">Move-in readiness</p>
                    <p className="text-sm font-black">{progress.percent}%</p>
                  </div>
                  <Progress value={progress.percent} className="mt-2 h-2" />
                  <p className="mt-2 text-xs text-stone-500">{progress.completed}/{progress.total} onboarding steps complete</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">Tenant invite</Badge>
                  <h2 className="mt-3 text-2xl font-black text-stone-950">Property-branded portal link</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    For MVP, the landlord can link from their website or email residents into this hosted portal.
                    Later, this can support a custom subdomain or embedded launcher.
                  </p>
                </div>
                <Link2 className="h-6 w-6 text-sky-700" />
              </div>
              <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase text-stone-500">Invite URL</p>
                <p className="mt-2 break-all font-mono text-sm text-stone-800">{portalUrl}</p>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button className="bg-stone-950 text-white hover:bg-stone-800" onClick={markInviteSent}>
                  <Send className="h-4 w-4" />
                  Send mock invite
                </Button>
                <Button variant="outline" onClick={acceptInvite}>
                  <CheckCircle2 className="h-4 w-4" />
                  Mark accepted
                </Button>
              </div>
              {(invitePreviewed || lifecycle?.inviteStatus === 'sent' || lifecycle?.inviteStatus === 'accepted') && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  Invite status: <span className="font-black capitalize">{lifecycle?.inviteStatus.replace(/_/g, ' ')}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Lifecycle record</Badge>
                  <h2 className="mt-3 text-2xl font-black text-stone-950">What the portal should show</h2>
                </div>
                <KeyRound className="h-6 w-6 text-[#8a5a00]" />
              </div>
              {lifecycle && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {lifecycleIcons.map((item) => {
                    const Icon = item.icon;
                    const value = lifecycle[item.key];
                    const status = 'status' in value ? String(value.status).replace(/_/g, ' ') : 'active';
                    const detail = item.key === 'lease'
                      ? `${formatDate(lifecycle.lease.startDate)} - ${formatDate(lifecycle.lease.endDate)}`
                      : item.key === 'securityDeposit'
                        ? lifecycle.securityDeposit.amountLabel
                        : item.key === 'nextRent'
                          ? `${lifecycle.nextRent.amountLabel} due ${formatDate(lifecycle.nextRent.dueDate)}`
                          : `${lifecycle.moveInInspection.photoCount} photos, ${lifecycle.moveInInspection.issueCount} notes`;

                    return (
                      <div key={item.label} className="rounded-lg border border-stone-200 p-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-stone-950 p-2 text-[#f6c451]">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-black text-stone-950">{item.label}</p>
                            <p className="mt-1 text-sm capitalize text-stone-600">{status}</p>
                            <p className="mt-2 text-xs leading-5 text-stone-500">{detail}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-stone-950">Onboarding checklist</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    This is the practical PMS-lite wedge: tenants complete move-in records, managers see what is stuck,
                    and rewards make the useful behavior feel positive.
                  </p>
                </div>
                <ClipboardCheck className="h-6 w-6 text-stone-500" />
              </div>
              <div className="mt-5 divide-y divide-stone-100">
                {onboardingSteps.map((step) => (
                  <div key={step.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-stone-950">{step.title}</p>
                        {typeof step.points === 'number' && (
                          <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">+{step.points}</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-stone-600">{step.description}</p>
                      {step.dueAt && <p className="mt-1 text-xs font-semibold text-stone-500">Due {formatDate(step.dueAt)}</p>}
                    </div>
                    <StatusBadge status={step.status} />
                    {stepAction(step)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-stone-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">Product layers</Badge>
                <div className="mt-4 space-y-3">
                  {[
                    [Home, 'Marketing site', 'Sells the product to landlords and property managers.'],
                    [Building2, 'Landlord portal', 'Setup, tenant invites, records, rewards, and operations queues.'],
                    [WalletCards, 'Resident portal', 'Move-in tasks, notices, rewards, maintenance, and renewal interest.'],
                  ].map(([Icon, title, detail]) => {
                    const TypedIcon = Icon as IconType;
                    return (
                      <div key={title as string} className="rounded-lg border border-stone-200 p-3">
                        <div className="flex items-start gap-3">
                          <TypedIcon className="mt-0.5 h-5 w-5 text-stone-700" />
                          <div>
                            <p className="font-black text-stone-950">{title as string}</p>
                            <p className="mt-1 text-sm leading-6 text-stone-600">{detail as string}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">Boundary</Badge>
                <h2 className="mt-3 text-xl font-black text-stone-950">Not full PMS yet</h2>
                <div className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
                  <div className="flex gap-2">
                    <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-700" />
                    <p>Track rent due status, but do not process rent.</p>
                  </div>
                  <div className="flex gap-2">
                    <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-700" />
                    <p>Confirm deposit status, but do not collect deposits.</p>
                  </div>
                  <div className="flex gap-2">
                    <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-700" />
                    <p>Upload and acknowledge lease packets, but do not replace legal e-signing.</p>
                  </div>
                  <div className="flex gap-2">
                    <Bell className="mt-0.5 h-4 w-4 text-[#8a5a00]" />
                    <p>Use rewards to reduce manager chasing during move-in and early residency.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">Recommended next product bet</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                Turn this flow into real Supabase-backed records before adding payments or accounting.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/resident-loyalty/resident-demo">
                  See tenant side
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button className="bg-stone-950 text-white hover:bg-stone-800" asChild>
                <Link href="/resident-loyalty">
                  See manager dashboard
                  <CalendarClock className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
