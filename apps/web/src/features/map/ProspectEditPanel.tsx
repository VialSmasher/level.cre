import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VoiceDictationButton } from '@/components/VoiceDictationButton';
import { CalendarDays, Clock3, Edit3, Mail, MapPin, MessageSquareText, Phone, Save, Trash2, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import {
  STATUS_META,
  type FollowUpTimeframeType,
  type Prospect,
  type ProspectStatusType,
} from '@level-cre/shared/schema';

export const PROSPECT_SPEED_TAG_SF_VALUES = [5000, 10000, 25000, 50000, 100000] as const;
const AUTO_NAME_REGEX = /^New\s+(polygon|rectangle|point|marker)/i;

export const FOLLOW_UP_LABELS: Record<FollowUpTimeframeType, string> = {
  '1_month': '1 Month',
  '3_month': '3 Months',
  '6_month': '6 Months',
  '1_year': '1 Year',
};

const timeframeToMonths: Record<FollowUpTimeframeType, number> = {
  '1_month': 1,
  '3_month': 3,
  '6_month': 6,
  '1_year': 12,
};

const addMonthsSafe = (dateValue: Date, months: number) => {
  const date = new Date(dateValue);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() < day) date.setDate(0);
  return date;
};

export const computeFollowUpDue = (anchorIso?: string, timeframe?: FollowUpTimeframeType) => {
  if (!timeframe) return undefined;
  const months = timeframeToMonths[timeframe] ?? 3;
  const anchor = anchorIso ? new Date(anchorIso) : new Date();
  return addMonthsSafe(anchor, months).toISOString();
};

export const formatSfWithCommas = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
};

export const getDisplayAddressValue = (name?: string | null) => {
  if (!name) return '';
  return AUTO_NAME_REGEX.test(name) ? '' : name;
};

export const parseSfInput = (raw: string): number | null => {
  const digitsOnly = raw.replace(/[^\d]/g, '');
  if (!digitsOnly) return null;
  const parsed = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseAcresInput = (raw: string): number | null => {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned || cleaned === '.') return null;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

export type ProspectEditPanelValues = {
  address: string;
  businessName: string;
  websiteUrl: string;
  buildingSf: string;
  lotSizeAcres: string;
  submarketId: string;
  notes: string;
  contactName: string;
  contactCompany: string;
  contactEmail: string;
  contactPhone: string;
};

type ContactInteraction = {
  id: string;
  date: string;
  type: string;
  outcome: string;
  notes?: string | null;
  nextFollowUp?: string | null;
  sourceProvider?: string | null;
  createdAt?: string | null;
};

const interactionIcon = (type: string) => {
  const normalized = String(type || '').toLowerCase();
  if (normalized.includes('call') || normalized.includes('phone')) return Phone;
  if (normalized.includes('email') || normalized.includes('mail')) return Mail;
  if (normalized.includes('meeting') || normalized.includes('tour')) return CalendarDays;
  return MessageSquareText;
};

const formatInteractionDate = (value?: string | null) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
};

const readableInteractionValue = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

type ProspectEditPanelProps = {
  prospect: Prospect;
  values: ProspectEditPanelValues;
  submarketOptions: string[];
  isEditingShape: boolean;
  canEditShape?: boolean;
  showSaveAction?: boolean;
  savePulse?: boolean;
  deleteDisabled?: boolean;
  coordinateLabel?: string;
  footerLeadingActions?: ReactNode;
  footerOverlay?: ReactNode;
  onClose: () => void;
  onSaveAction?: () => void;
  onDelete: () => void;
  onEditShape: () => void;
  onDrawArea: () => void;
  onCopyCoordinates?: () => void;
  onOpenCoordinatesInMaps?: () => void;
  onAddressChange: (value: string) => void;
  onAddressBlur?: () => void;
  onBusinessNameChange: (value: string) => void;
  onWebsiteUrlChange: (value: string) => void;
  onStatusChange: (value: ProspectStatusType) => void;
  onFollowUpChange: (timeframe: FollowUpTimeframeType | undefined, dueDate: string | null) => void;
  onBuildingSfChange: (displayValue: string, parsedValue: number | null) => void;
  onLotSizeAcresChange: (displayValue: string, parsedValue: number | null) => void;
  onSubmarketChange: (value: string | undefined) => void;
  onNotesChange: (value: string) => void;
  onNotesBlur?: () => void;
  onContactNameChange: (value: string) => void;
  onContactNameBlur?: () => void;
  onContactCompanyChange: (value: string) => void;
  onContactCompanyBlur?: () => void;
  onContactEmailChange: (value: string) => void;
  onContactEmailBlur?: () => void;
  onContactPhoneChange: (value: string) => void;
  onContactPhoneBlur?: () => void;
};

export function ProspectEditPanel({
  prospect,
  values,
  submarketOptions,
  isEditingShape,
  canEditShape = true,
  showSaveAction = false,
  savePulse = false,
  deleteDisabled = false,
  coordinateLabel,
  footerLeadingActions,
  footerOverlay,
  onClose,
  onSaveAction,
  onDelete,
  onEditShape,
  onDrawArea,
  onCopyCoordinates,
  onOpenCoordinatesInMaps,
  onAddressChange,
  onAddressBlur,
  onBusinessNameChange,
  onWebsiteUrlChange,
  onStatusChange,
  onFollowUpChange,
  onBuildingSfChange,
  onLotSizeAcresChange,
  onSubmarketChange,
  onNotesChange,
  onNotesBlur,
  onContactNameChange,
  onContactNameBlur,
  onContactCompanyChange,
  onContactCompanyBlur,
  onContactEmailChange,
  onContactEmailBlur,
  onContactPhoneChange,
  onContactPhoneBlur,
}: ProspectEditPanelProps) {
  const { isDemoMode } = useAuth();
  const interactionsQuery = useQuery<ContactInteraction[]>({
    queryKey: ['/api/interactions', prospect.id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/interactions?prospectId=${encodeURIComponent(prospect.id)}`);
      return response.json();
    },
    enabled: !isDemoMode || import.meta.env.DEV,
    staleTime: 60_000,
  });
  const recentInteractions = useMemo(
    () => [...(interactionsQuery.data || [])]
      .sort((left, right) => new Date(right.date || right.createdAt || 0).getTime() - new Date(left.date || left.createdAt || 0).getTime())
      .slice(0, 12),
    [interactionsQuery.data],
  );
  const geometryType = prospect.geometry.type as string;
  const isAreaShape = geometryType === 'Polygon' || geometryType === 'Rectangle';
  const shapeButtonLabel = isAreaShape
    ? isEditingShape ? 'Finish editing' : 'Edit shape'
    : 'Draw area';

  return (
    <div
      className="absolute bottom-2 left-2 right-2 z-[80] flex max-h-[74dvh] flex-col overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl md:left-auto md:right-0 md:top-0 md:bottom-auto md:w-80 md:max-h-[90vh] md:rounded-none md:border-y-0 md:border-r-0 md:border-l"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="sticky top-0 z-10 bg-white border-b px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Edit Prospect</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 h-6 w-6 p-0"
                aria-label="Save and close"
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Save and close</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        <p className="text-[11px] text-gray-500">Changes save automatically</p>
        <Tabs defaultValue="property" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="property" className="text-xs">Property</TabsTrigger>
            <TabsTrigger value="contact" className="text-xs">Contact</TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="property" className="space-y-4">
            <div>
              <Label className="text-xs font-medium text-gray-700">Business Name</Label>
              <Input
                value={values.businessName}
                onChange={(event) => onBusinessNameChange(event.target.value)}
                placeholder="Business name"
                className="h-8 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-gray-700">Address</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={values.address}
                  onChange={(event) => onAddressChange(event.target.value)}
                  onBlur={onAddressBlur}
                  placeholder="Property address"
                  className="h-8 text-sm"
                />
                {onOpenCoordinatesInMaps && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 w-8 p-0 shrink-0"
                        aria-label="Open coordinates in Google Maps"
                        title="Open in Google Maps"
                        onClick={onOpenCoordinatesInMaps}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open point in Google Maps</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-gray-700">Status</Label>
                <Select value={prospect.status} onValueChange={(value: ProspectStatusType) => onStatusChange(value)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    {Object.entries(STATUS_META).map(([key, meta]) => (
                      <SelectItem key={key} value={key}>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                          {meta.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-medium text-gray-700">Follow Up</Label>
                <Select
                  value={prospect.followUpTimeframe || 'none'}
                  onValueChange={(value: FollowUpTimeframeType | 'none') => {
                    const timeframe = value === 'none' ? undefined : value;
                    const anchor = prospect.lastContactDate || prospect.createdDate;
                    const dueDate = timeframe ? computeFollowUpDue(anchor, timeframe) : null;
                    onFollowUpChange(timeframe, dueDate);
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    <SelectItem value="none">None</SelectItem>
                    {Object.entries(FOLLOW_UP_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-700">Speed Tags</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {PROSPECT_SPEED_TAG_SF_VALUES.map((sf) => (
                  <Button
                    key={sf}
                    type="button"
                    variant="outline"
                    className="h-7 px-0 text-[11px]"
                    onClick={() => onBuildingSfChange(formatSfWithCommas(sf), sf)}
                  >
                    {sf >= 100000 ? '100k+' : `${Math.round(sf / 1000)}k`}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-gray-700">Building SF</Label>
                <Input
                  value={values.buildingSf}
                  onChange={(event) => {
                    const parsed = parseSfInput(event.target.value);
                    onBuildingSfChange(parsed === null ? '' : formatSfWithCommas(parsed), parsed);
                  }}
                  placeholder="e.g. 10,000"
                  inputMode="numeric"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-700">Lot Size (Acres)</Label>
                <Input
                  value={values.lotSizeAcres}
                  onChange={(event) => onLotSizeAcresChange(event.target.value, parseAcresInput(event.target.value))}
                  placeholder="Auto or manual"
                  inputMode="decimal"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium text-gray-700">Submarket</Label>
              {submarketOptions.length === 0 ? (
                <Select disabled>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="No submarkets defined" />
                  </SelectTrigger>
                </Select>
              ) : (
                <Select value={values.submarketId} onValueChange={(value) => onSubmarketChange(value === 'none' ? undefined : value)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select submarket" />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    <SelectItem value="none">None</SelectItem>
                    {submarketOptions.map((submarketName) => (
                      <SelectItem key={submarketName} value={submarketName}>
                        {submarketName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-gray-700">Notes</Label>
                <VoiceDictationButton
                  className="h-7 w-7 p-0"
                  onTranscript={(text) => onNotesChange(values.notes ? `${values.notes.trimEnd()} ${text}` : text)}
                />
              </div>
              <Textarea
                value={values.notes}
                onChange={(event) => onNotesChange(event.target.value)}
                onBlur={onNotesBlur}
                placeholder="Add notes..."
                rows={3}
                className="resize-none text-sm"
              />
            </div>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4">
            <div>
              <Label className="text-xs font-medium text-gray-700">Website</Label>
              <Input
                type="url"
                value={values.websiteUrl}
                onChange={(event) => onWebsiteUrlChange(event.target.value)}
                placeholder="Website URL"
                className="h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-gray-700">Contact Name</Label>
                <Input
                  value={values.contactName}
                  onChange={(event) => onContactNameChange(event.target.value)}
                  onBlur={onContactNameBlur}
                  placeholder="Name"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-700">Company</Label>
                <Input
                  value={values.contactCompany}
                  onChange={(event) => onContactCompanyChange(event.target.value)}
                  onBlur={onContactCompanyBlur}
                  placeholder="Company"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-gray-700">Email</Label>
                <Input
                  type="email"
                  value={values.contactEmail}
                  onChange={(event) => onContactEmailChange(event.target.value)}
                  onBlur={onContactEmailBlur}
                  placeholder="Email"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-700">Phone</Label>
                <PhoneInput
                  value={values.contactPhone}
                  onChange={(event) => onContactPhoneChange(event.target.value)}
                  onBlur={onContactPhoneBlur}
                  placeholder="(000) 000-0000"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-800">Recent activity</p>
                <p className="mt-0.5 text-[11px] text-gray-500">Calls, emails, meetings, and notes</p>
              </div>
              <span className="rounded bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600">
                {recentInteractions.length}
              </span>
            </div>

            {interactionsQuery.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded bg-gray-100" />)}
              </div>
            ) : null}

            {!interactionsQuery.isLoading && recentInteractions.length === 0 ? (
              <div className="border-y border-gray-100 py-8 text-center">
                <MessageSquareText className="mx-auto h-6 w-6 text-gray-300" />
                <p className="mt-2 text-xs font-medium text-gray-700">No activity recorded yet</p>
                <p className="mt-1 text-[11px] leading-5 text-gray-500">Quick-log a call or meeting, or let Codex attach the next email.</p>
              </div>
            ) : null}

            {interactionsQuery.isError ? (
              <div role="alert" className="border-y border-red-100 py-4 text-xs text-red-700">Activity history could not be loaded.</div>
            ) : null}

            {recentInteractions.length > 0 ? (
              <div className="divide-y divide-gray-100 border-y border-gray-100">
                {recentInteractions.map((interaction) => {
                  const InteractionIcon = interactionIcon(interaction.type);
                  return (
                    <article key={interaction.id} className="flex gap-3 py-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-50 text-blue-700">
                        <InteractionIcon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-800">{readableInteractionValue(interaction.type)}</p>
                          <span className="shrink-0 text-[10px] text-gray-400">{formatInteractionDate(interaction.date || interaction.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {readableInteractionValue(interaction.outcome)}
                          {interaction.sourceProvider ? ` / ${readableInteractionValue(interaction.sourceProvider)}` : ' / Manual'}
                        </p>
                        {interaction.notes ? <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-gray-600">{interaction.notes}</p> : null}
                        {interaction.nextFollowUp ? (
                          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-amber-700">
                            <Clock3 className="h-3 w-3" />
                            Next {formatInteractionDate(interaction.nextFollowUp)}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>

      <div className="sticky bottom-0 z-10 bg-white border-t px-4 py-3 relative">
        <div className="relative flex items-center justify-center">
          {footerOverlay}
          <div className={`flex items-center gap-1 ${savePulse ? 'animate-pulse' : ''}`}>
            {footerLeadingActions}
            {showSaveAction && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onSaveAction || onClose}
                    variant="outline"
                    className="h-8 w-8 p-0 text-xs"
                    aria-label="Save and close"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save and close</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={isAreaShape ? onEditShape : onDrawArea}
                  variant="outline"
                  className="h-8 w-8 p-0"
                  disabled={!canEditShape}
                  aria-label={shapeButtonLabel}
                  title={shapeButtonLabel}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{shapeButtonLabel}</TooltipContent>
            </Tooltip>
          </div>

          <Button
            onClick={onDelete}
            variant="destructive"
            className="absolute right-0 h-8 px-3 text-xs"
            title="Delete Prospect"
            disabled={deleteDisabled}
            aria-label="Delete prospect"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {coordinateLabel && onCopyCoordinates && (
          <button
            type="button"
            className="mt-2 block w-full text-[10px] text-gray-400 hover:text-gray-600 text-center"
            onClick={onCopyCoordinates}
            title="Click to copy coordinates"
          >
            {coordinateLabel}
          </button>
        )}
      </div>
    </div>
  );
}
