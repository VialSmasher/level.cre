import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Mic, MicOff, Sparkles, Wand2 } from "lucide-react";
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

type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: any) => void) | null;
  start: () => void;
  stop: () => void;
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

function extractNumber(value: string | undefined) {
  if (!value) return "";
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function sentenceContaining(text: string, keyword: string) {
  const found = text
    .split(/[.!?]\s*/)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.toLowerCase().includes(keyword));
  return found || "";
}

function parseRequirementTranscript(transcript: string): Partial<RequirementFormState> {
  const text = transcript.trim();
  const lower = text.toLowerCase();
  const parsed: Partial<RequirementFormState> = {};

  if (!text) return parsed;

  parsed.title = text.split(/[.!?]/)[0]?.slice(0, 72).trim() || "Dictated requirement";
  parsed.status = "active";
  parsed.market = lower.includes("calgary") ? "Calgary" : lower.includes("edmonton") ? "Edmonton" : "";
  parsed.dealType = lower.includes("purchase") || lower.includes("buy") || lower.includes("sale")
    ? "sale"
    : lower.includes("lease")
      ? "lease"
      : lower.includes("either")
        ? "either"
        : undefined;

  const clientMatch = text.match(/\b(?:client|tenant|buyer|company)\s+(?:is\s+|called\s+|named\s+)?([A-Za-z0-9 &'’.-]{2,60})/i);
  if (clientMatch?.[1]) {
    parsed.clientName = clientMatch[1].replace(/\b(?:needs|is|looking|wants|requires)\b.*$/i, "").trim();
  }

  const sfRangeMatch = text.match(/(\d[\d,]*)\s*(?:-|to|and)\s*(\d[\d,]*)\s*(?:sf|square feet|sq ft)/i);
  const sfSingleMatch = text.match(/(?:about|around|approximately|needs|need|looking for)?\s*(\d[\d,]*)\s*(?:sf|square feet|sq ft)/i);
  if (sfRangeMatch) {
    parsed.minSf = extractNumber(sfRangeMatch[1]);
    parsed.maxSf = extractNumber(sfRangeMatch[2]);
  } else if (sfSingleMatch) {
    parsed.minSf = extractNumber(sfSingleMatch[1]);
  }

  const clearHeightMatch = text.match(/(?:clear height|clear|ceiling height)[^\d]*(\d+(?:\.\d+)?)/i) || text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?\s*clear/i);
  if (clearHeightMatch?.[1]) parsed.minClearHeightFt = clearHeightMatch[1];

  const dockMatch = text.match(/(\d+)\s*(?:dock|dock doors|dock door)/i);
  if (dockMatch?.[1]) parsed.requiredDockDoors = dockMatch[1];

  const gradeMatch = text.match(/(\d+)\s*(?:grade|grade doors|grade door)/i);
  if (gradeMatch?.[1]) parsed.requiredGradeDoors = gradeMatch[1];

  const yardMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:acre|acres|ac)\s*(?:yard|site|land)?/i);
  if (yardMatch?.[1]) parsed.minYardAcres = yardMatch[1];

  const budgetMatch = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:psf|per square foot|net rent|net)/i);
  if (budgetMatch?.[1]) parsed.maxBudgetPsf = budgetMatch[1];

  const submarketMatch = text.match(/\b(?:in|near|around|focused on)\s+([A-Za-z ]+?)\s+(?:submarket|area|edmonton|calgary|with|for|from|and|$)/i);
  if (submarketMatch?.[1]) parsed.submarket = submarketMatch[1].trim();

  parsed.powerNotes = sentenceContaining(text, "power");
  parsed.officeNotes = sentenceContaining(text, "office");
  parsed.timingNotes =
    sentenceContaining(text, "immediate") ||
    sentenceContaining(text, "asap") ||
    sentenceContaining(text, "month") ||
    sentenceContaining(text, "quarter") ||
    sentenceContaining(text, "q1") ||
    sentenceContaining(text, "q2") ||
    sentenceContaining(text, "q3") ||
    sentenceContaining(text, "q4");
  parsed.specialNotes = text;
  parsed.isOffMarketSearchEnabled = lower.includes("off market") || lower.includes("off-market");

  return parsed;
}

export default function IndustrialIntelRequirementsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RequirementFormState>(EMPTY_FORM);
  const [dictationText, setDictationText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<InstanceType<SpeechRecognitionCtor> | null>(null);

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

  const applyDictation = () => {
    const parsed = parseRequirementTranscript(dictationText);
    setForm((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => value !== undefined && value !== ""),
      ),
    }));
    toast({ title: "Requirement draft filled", description: "Review the fields, then save when ready." });
  };

  const toggleDictation = () => {
    if (isListening) {
      recognition?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Voice dictation unavailable",
        description: "Paste dictated notes into the transcript box and use Fill form instead.",
        variant: "destructive",
      });
      return;
    }

    const nextRecognition = new (SpeechRecognition as SpeechRecognitionCtor)();
    nextRecognition.continuous = true;
    nextRecognition.interimResults = true;
    nextRecognition.lang = "en-CA";
    nextRecognition.onresult = (event: any) => {
      let spoken = "";
      for (let index = 0; index < event.results.length; index += 1) {
        spoken += event.results[index][0]?.transcript || "";
      }
      setDictationText(spoken.trim());
    };
    nextRecognition.onerror = (event) => {
      setIsListening(false);
      toast({
        title: "Dictation stopped",
        description: event.error || "The browser stopped voice capture.",
        variant: "destructive",
      });
    };
    nextRecognition.onend = () => setIsListening(false);
    setRecognition(nextRecognition);
    setIsListening(true);
    nextRecognition.start();
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <ClipboardList className="h-3.5 w-3.5" />
            Matching inputs
          </span>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Requirements workbench</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Capture clean tenant and buyer demand so Industrial Intel can score inventory, flag gaps, and prepare client-ready shortlists.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm">
          <Sparkles className="h-4 w-4 text-blue-600" />
          Matching engine foundation
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create requirement</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-800">
                      <Mic className="h-4 w-4" />
                      Voice intake
                    </h3>
                    <p className="mt-1 text-sm text-blue-900/80">
                      Dictate a requirement, then let the workbench prefill the structured fields.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={toggleDictation} className={isListening ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-blue-600 text-white hover:bg-blue-700"}>
                      {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                      {isListening ? "Stop" : "Dictate"}
                    </Button>
                    <Button type="button" variant="outline" onClick={applyDictation} disabled={!dictationText.trim()}>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Fill form
                    </Button>
                  </div>
                </div>
                <Textarea
                  className="mt-3 min-h-24 bg-white"
                  value={dictationText}
                  onChange={(event) => setDictationText(event.target.value)}
                  placeholder="Example: Client ABC needs 15,000 to 30,000 SF in West Edmonton, lease, 24 foot clear, two dock doors, one grade door, 1.5 acre yard, heavy power, immediate timing..."
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Start with the basics, add any hard building constraints, then save the requirement
                when it is ready for review or matching.
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Basics</h3>
                  <p className="mt-1 text-sm text-slate-500">Who the requirement is for, where it should land, and what type of deal it is.</p>
                </div>
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

              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Size and building</h3>
                  <p className="mt-1 text-sm text-slate-500">Capture the core size range and physical constraints that matter for screening listings.</p>
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

              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Notes and intent</h3>
                  <p className="mt-1 text-sm text-slate-500">Use notes for nuance that should influence matching, review, or off-market follow-up.</p>
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

              </div>

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
                <p className="text-base font-medium text-slate-900">No saved requirements yet</p>
                <p className="mt-2 text-sm text-slate-600">
                  Your saved requirements will appear here. Start with one clear requirement, then Industrial Intel can score listings against it.
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
