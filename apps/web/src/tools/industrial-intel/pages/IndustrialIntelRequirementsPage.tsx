import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const STATUS_OPTIONS = ["draft", "active", "paused", "filled", "archived"] as const;
const DEAL_TYPE_OPTIONS = ["lease", "sale", "either"] as const;

type IntelRequirement = {
  id: string;
  title: string;
  clientName: string | null;
  status: string;
  dealType: string;
  market: string | null;
  submarket: string | null;
  minSf: number | null;
  maxSf: number | null;
  minClearHeightFt?: number | null;
  maxBudgetPsf?: number | null;
  requiredDockDoors?: number | null;
  requiredGradeDoors?: number | null;
  minYardAcres?: number | null;
  powerNotes?: string | null;
  officeNotes?: string | null;
  timingNotes?: string | null;
  specialNotes?: string | null;
  isOffMarketSearchEnabled: boolean;
  updatedAt: string | null;
  archivedAt: string | null;
};

type RequirementFormState = {
  title: string;
  clientName: string;
  status: string;
  dealType: string;
  market: string;
  submarket: string;
  minSf: string;
  maxSf: string;
  minClearHeightFt: string;
  maxBudgetPsf: string;
  requiredDockDoors: string;
  requiredGradeDoors: string;
  minYardAcres: string;
  powerNotes: string;
  officeNotes: string;
  timingNotes: string;
  specialNotes: string;
  isOffMarketSearchEnabled: boolean;
};

const EMPTY_FORM: RequirementFormState = {
  title: "",
  clientName: "",
  status: "draft",
  dealType: "lease",
  market: "",
  submarket: "",
  minSf: "",
  maxSf: "",
  minClearHeightFt: "",
  maxBudgetPsf: "",
  requiredDockDoors: "",
  requiredGradeDoors: "",
  minYardAcres: "",
  powerNotes: "",
  officeNotes: "",
  timingNotes: "",
  specialNotes: "",
  isOffMarketSearchEnabled: false,
};

function toNullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

export default function IndustrialIntelRequirementsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RequirementFormState>(EMPTY_FORM);

  const { data: requirements = [], isLoading } = useQuery<IntelRequirement[]>({
    queryKey: ["/api/intel/requirements"],
  });

  const createRequirementMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/intel/requirements", {
        title: form.title.trim(),
        clientName: form.clientName.trim() || null,
        status: form.status,
        dealType: form.dealType,
        market: form.market.trim() || null,
        submarket: form.submarket.trim() || null,
        minSf: toNullableNumber(form.minSf),
        maxSf: toNullableNumber(form.maxSf),
        minClearHeightFt: toNullableNumber(form.minClearHeightFt),
        maxBudgetPsf: toNullableNumber(form.maxBudgetPsf),
        requiredDockDoors: toNullableNumber(form.requiredDockDoors),
        requiredGradeDoors: toNullableNumber(form.requiredGradeDoors),
        minYardAcres: toNullableNumber(form.minYardAcres),
        powerNotes: form.powerNotes.trim() || null,
        officeNotes: form.officeNotes.trim() || null,
        timingNotes: form.timingNotes.trim() || null,
        specialNotes: form.specialNotes.trim() || null,
        isOffMarketSearchEnabled: form.isOffMarketSearchEnabled,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel/requirements"] });
      setForm(EMPTY_FORM);
      toast({ title: "Industrial Intel requirement created" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create requirement",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast({
        title: "Title required",
        description: "Give this requirement a short working title first.",
        variant: "destructive",
      });
      return;
    }
    createRequirementMutation.mutate();
  };

  const updateField = <K extends keyof RequirementFormState>(key: K, value: RequirementFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-3xl font-semibold text-slate-950">Requirements</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          This is the first Tool B requirement intake slice. It stores structured search criteria in
          Industrial Intel tables only, so later matching can stay isolated from Tool A.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create requirement</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={form.title} onChange={(e) => updateField("title", e.target.value)} placeholder="West Edmonton lease requirement" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Client</Label>
                  <Input id="clientName" value={form.clientName} onChange={(e) => updateField("clientName", e.target.value)} placeholder="Example client" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="market">Market</Label>
                  <Input id="market" value={form.market} onChange={(e) => updateField("market", e.target.value)} placeholder="Edmonton" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="submarket">Submarket</Label>
                  <Input id="submarket" value={form.submarket} onChange={(e) => updateField("submarket", e.target.value)} placeholder="West Edmonton" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select id="status" value={form.status} onChange={(e) => updateField("status", e.target.value)} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dealType">Deal type</Label>
                  <select id="dealType" value={form.dealType} onChange={(e) => updateField("dealType", e.target.value)} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                    {DEAL_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="minSf">Min SF</Label>
                  <Input id="minSf" value={form.minSf} onChange={(e) => updateField("minSf", e.target.value)} inputMode="numeric" placeholder="15000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxSf">Max SF</Label>
                  <Input id="maxSf" value={form.maxSf} onChange={(e) => updateField("maxSf", e.target.value)} inputMode="numeric" placeholder="30000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minClearHeightFt">Min clear height</Label>
                  <Input id="minClearHeightFt" value={form.minClearHeightFt} onChange={(e) => updateField("minClearHeightFt", e.target.value)} inputMode="decimal" placeholder="24" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxBudgetPsf">Max budget / PSF</Label>
                  <Input id="maxBudgetPsf" value={form.maxBudgetPsf} onChange={(e) => updateField("maxBudgetPsf", e.target.value)} inputMode="decimal" placeholder="16.50" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="requiredDockDoors">Required dock doors</Label>
                  <Input id="requiredDockDoors" value={form.requiredDockDoors} onChange={(e) => updateField("requiredDockDoors", e.target.value)} inputMode="numeric" placeholder="2" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requiredGradeDoors">Required grade doors</Label>
                  <Input id="requiredGradeDoors" value={form.requiredGradeDoors} onChange={(e) => updateField("requiredGradeDoors", e.target.value)} inputMode="numeric" placeholder="1" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minYardAcres">Min yard acres</Label>
                  <Input id="minYardAcres" value={form.minYardAcres} onChange={(e) => updateField("minYardAcres", e.target.value)} inputMode="decimal" placeholder="1.5" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="powerNotes">Power notes</Label>
                  <Textarea id="powerNotes" value={form.powerNotes} onChange={(e) => updateField("powerNotes", e.target.value)} placeholder="Heavy power preferred" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="officeNotes">Office notes</Label>
                  <Textarea id="officeNotes" value={form.officeNotes} onChange={(e) => updateField("officeNotes", e.target.value)} placeholder="Minimal office preferred" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="timingNotes">Timing notes</Label>
                  <Textarea id="timingNotes" value={form.timingNotes} onChange={(e) => updateField("timingNotes", e.target.value)} placeholder="Need occupancy by Q3" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialNotes">Special notes</Label>
                  <Textarea id="specialNotes" value={form.specialNotes} onChange={(e) => updateField("specialNotes", e.target.value)} placeholder="Truck court matters, excess office avoid, etc." />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={form.isOffMarketSearchEnabled} onChange={(e) => updateField("isOffMarketSearchEnabled", e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Include off-market search intent for this requirement
              </label>

              <Button type="submit" disabled={createRequirementMutation.isPending} className="bg-slate-950 text-white hover:bg-slate-800">
                {createRequirementMutation.isPending ? "Saving..." : "Create requirement"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved requirements</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading requirements...</p>
            ) : requirements.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-base font-medium text-slate-900">No Tool B requirements yet</p>
                <p className="mt-2 text-sm text-slate-600">
                  Create the first one here. Once requirements exist, the next slice can start scoring listings against them.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {requirements.map((requirement) => (
                  <div key={requirement.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-950">{requirement.title}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {requirement.clientName || "No client name yet"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{requirement.dealType}</span>
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">{requirement.status}</span>
                        {requirement.isOffMarketSearchEnabled && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">off-market on</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      <p>
                        <span className="font-medium text-slate-900">Area:</span>{" "}
                        {requirement.submarket || requirement.market || "Unspecified"}
                      </p>
                      <p>
                        <span className="font-medium text-slate-900">Size:</span>{" "}
                        {requirement.minSf?.toLocaleString() || "?"} - {requirement.maxSf?.toLocaleString() || "?"} SF
                      </p>
                    </div>

                    <p className="mt-3 text-xs text-slate-500">
                      Updated {formatDateTime(requirement.updatedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
