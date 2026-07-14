import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, MapPin, Upload, XCircle } from 'lucide-react';
import type { Prospect } from '@level-cre/shared/schema';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/primitives/Modal';
import { apiRequest } from '@/lib/queryClient';
import { useGeocode } from '@/hooks/useGeocode';
import { useToast } from '@/hooks/use-toast';
import {
  applyPropertyImportSource,
  chooseBestPursuitImportSheet,
  detectPropertyImportSource,
  normalizePursuitAddress,
  parsePursuitImportSheet,
  preparePursuitImportRows,
  type ParsedPursuitImportSheet,
  type PreparedPursuitImportRow,
} from '@/lib/pursuitSpreadsheetImport';

type BulkImportResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  prospects: Prospect[];
  errors: Array<{ row: number; message: string }>;
};

type Props = {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingProspects: Prospect[];
  canImport: boolean;
};

const MAX_IMPORT_ROWS = 200;

function appendEdmontonMarket(address: string): string {
  if (/\bedmonton\b/i.test(address)) return address;
  return `${address}, Edmonton, Alberta, Canada`;
}
function fileStem(fileName: string): string {
  return fileName.replace(/\.(xlsx|xls|csv)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Spreadsheet import';
}

function formatNumber(value: number | null): string {
  return value === null ? '—' : Math.round(value).toLocaleString();
}

function rowLocationLabel(row: PreparedPursuitImportRow): string {
  if (row.duplicateReason) return row.duplicateReason;
  if (row.updateReason) return row.updateReason;
  if (row.latitude !== null && row.longitude !== null) return 'Ready';
  if (row.geocodeError) return 'Could not locate';
  return 'Needs location';
}

function downloadTemplate() {
  const headers = [
    'Address',
    'Property Name',
    'Building SF',
    'Lot Size Acres',
    'Submarket',
    'Owner',
    'Contact',
    'Email',
    'Phone',
    'Status',
    'Notes',
    'Latitude',
    'Longitude',
  ];
  const blob = new Blob([`${headers.join(',')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'Level-CRE-Pursuit-Import-Template.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function PursuitSpreadsheetImportDialog({ listingId, open, onOpenChange, existingProspects, canImport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const geocode = useGeocode();
  const { toast } = useToast();
  const [sourceName, setSourceName] = useState('');
  const [selectedSheet, setSelectedSheet] = useState<ParsedPursuitImportSheet | null>(null);
  const [rows, setRows] = useState<PreparedPursuitImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locateProgress, setLocateProgress] = useState({ complete: 0, total: 0 });

  const selectedRows = useMemo(() => rows.filter((row) => row.selected && !row.duplicateReason), [rows]);
  const duplicateCount = useMemo(() => rows.filter((row) => Boolean(row.duplicateReason)).length, [rows]);
  const unresolvedRows = useMemo(
    () => selectedRows.filter((row) => row.latitude === null || row.longitude === null),
    [selectedRows],
  );
  const readyRows = useMemo(
    () => selectedRows.filter((row) => row.latitude !== null && row.longitude !== null),
    [selectedRows],
  );

  const reset = () => {
    setSourceName('');
    setSelectedSheet(null);
    setRows([]);
    setParseError(null);
    setIsParsing(false);
    setIsLocating(false);
    setLocateProgress({ complete: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isLocating && !importMutation.isPending) reset();
    onOpenChange(nextOpen);
  };

  const loadFile = async (file: File | null) => {
    if (!file) return;
    setIsParsing(true);
    setParseError(null);
    setRows([]);
    setSelectedSheet(null);

    try {
      const candidates: ParsedPursuitImportSheet[] = [];
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) continue;
          const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: true });
          const parsed = parsePursuitImportSheet(matrix, sheetName, MAX_IMPORT_ROWS);
          if (parsed) candidates.push(parsed);
        }
      } else if (lowerName.endsWith('.csv')) {
        const result = Papa.parse<unknown[]>(await file.text(), { header: false, skipEmptyLines: 'greedy' });
        if (result.errors.length > 0 && result.data.length === 0) throw new Error(result.errors[0]?.message || 'Could not read that CSV.');
        const parsed = parsePursuitImportSheet(result.data as unknown[][], 'CSV', MAX_IMPORT_ROWS);
        if (parsed) candidates.push(parsed);
      } else {
        throw new Error('Choose an Excel (.xlsx or .xls) or CSV file.');
      }

      const detectedSheet = chooseBestPursuitImportSheet(candidates);
      if (!detectedSheet) {
        throw new Error('No usable property rows were found. The spreadsheet needs an Address column.');
      }
      const best = applyPropertyImportSource(detectedSheet, detectPropertyImportSource(file.name, detectedSheet));
      setSourceName(fileStem(file.name));
      setSelectedSheet(best);
      setRows(preparePursuitImportRows(best.rows, existingProspects));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not read that spreadsheet.');
    } finally {
      setIsParsing(false);
    }
  };

  const locateSelectedRows = async () => {
    const indexes = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.selected && !row.duplicateReason && (row.latitude === null || row.longitude === null))
      .map(({ index }) => index);
    if (indexes.length === 0) return;

    setIsLocating(true);
    setLocateProgress({ complete: 0, total: indexes.length });
    const next = [...rows];
    for (let progressIndex = 0; progressIndex < indexes.length; progressIndex += 1) {
      const rowIndex = indexes[progressIndex];
      const row = next[rowIndex];
      let result = await geocode.forward(appendEdmontonMarket(row.address));
      if (result.error === 'OVER_QUERY_LIMIT') {
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        result = await geocode.forward(appendEdmontonMarket(row.address));
      }

      next[rowIndex] = result.location
        ? {
            ...row,
            latitude: result.location.lat,
            longitude: result.location.lng,
            formattedAddress: result.address || row.address,
            geocodeError: null,
          }
        : { ...row, geocodeError: result.error || 'No matching address' };
      setRows([...next]);
      setLocateProgress({ complete: progressIndex + 1, total: indexes.length });
      if (progressIndex < indexes.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    setIsLocating(false);
  };

  const importMutation = useMutation<BulkImportResult, Error>({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/listings/${listingId}/prospects/bulk`, {
        sourceName,
        records: readyRows.map((row) => ({
          sourceRow: row.sourceRow,
          sourceSheet: row.sourceSheet,
          sourceSystem: row.sourceSystem,
          importKind: row.importKind,
          sourceRecordId: row.sourceRecordId,
          sourceUrl: row.sourceUrl,
          address: row.formattedAddress || row.address,
          propertyName: row.propertyName,
          status: row.status,
          buildingSf: row.buildingSf,
          lotSizeAcres: row.lotSizeAcres,
          submarket: row.submarket,
          submarketBucket: row.submarketBucket,
          ownerCompany: row.ownerCompany,
          tenantName: row.tenantName,
          suite: row.suite,
          occupancySf: row.occupancySf,
          availableSf: row.availableSf,
          leaseCommencementDate: row.leaseCommencementDate,
          leaseExpirationDate: row.leaseExpirationDate,
          renewalNoticeDate: row.renewalNoticeDate,
          leaseTermMonths: row.leaseTermMonths,
          askingRentPsf: row.askingRentPsf,
          listingType: row.listingType,
          contactName: row.contactName,
          contactEmail: row.contactEmail,
          contactPhone: row.contactPhone,
          notes: row.notes,
          latitude: row.latitude,
          longitude: row.longitude,
        })),
      });
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/listings', listingId, 'prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/listings'] });
      toast({
        title: `${result.created} added · ${result.updated} updated`,
        description: result.skipped > 0 ? `${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped.` : 'The shared pursuit map and source data are up to date.',
      });
      handleOpenChange(false);
    },
    onError: (error) => {
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
    },
  });

  const toggleRow = (index: number) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index && !row.duplicateReason ? { ...row, selected: !row.selected } : row));
  };

  const hasRows = rows.length > 0;
  const canSubmit = canImport && readyRows.length > 0 && unresolvedRows.length === 0 && !isLocating && !importMutation.isPending;

  return (
    <Modal open={open} onOpenChange={handleOpenChange}>
      <ModalContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
        <ModalHeader className="border-b border-slate-200 px-6 py-5 pr-14">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <ModalTitle>Import assets from Excel</ModalTitle>
              <ModalDescription className="mt-1">
                Preview, locate and bulk-add buildings to this shared pursuit. Existing addresses are skipped automatically.
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <div className="max-h-[calc(92vh-9.5rem)] overflow-y-auto px-6 py-5">
          {!hasRows ? (
            <div className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-blue-400 hover:bg-blue-50/50">
                {isParsing ? <Loader2 className="h-8 w-8 animate-spin text-blue-600" /> : <Upload className="h-8 w-8 text-blue-600" />}
                <span className="mt-4 text-sm font-semibold text-slate-900">Choose an Excel or CSV file</span>
                <span className="mt-1 text-xs text-slate-500">Supports .xlsx, .xls and .csv · up to {MAX_IMPORT_ROWS} property rows</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="sr-only"
                  disabled={isParsing || !canImport}
                  onChange={(event) => loadFile(event.target.files?.[0] || null)}
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Flexible column matching</p>
                  <p className="text-xs text-slate-500">Address is required. Building SF, owner, contact, notes, submarket and coordinates are optional.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
                  <Download className="h-4 w-4" />
                  CSV template
                </Button>
              </div>

              {parseError && (
                <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {parseError}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <SummaryCard label="Rows found" value={rows.length} />
                <SummaryCard label="Selected" value={selectedRows.length} tone="blue" />
                <SummaryCard label="Ready to import" value={readyRows.length} tone="green" />
                <SummaryCard label="Duplicates" value={duplicateCount} tone="amber" />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{sourceName}</p>
                  <p className="text-xs text-slate-500">
                    {selectedSheet?.sourceSystem === 'generic' ? 'Flexible import' : `${selectedSheet?.sourceSystem === 'costar' ? 'CoStar' : 'Gettel Network'} import`} · using “{selectedSheet?.sheetName}” · {selectedSheet?.importKind} data · header row {selectedSheet?.headerRow}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={reset} disabled={isLocating || importMutation.isPending}>
                  Choose another file
                </Button>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="w-12 px-3 py-3">Add</th>
                        <th className="min-w-[240px] px-3 py-3">Address</th>
                        <th className="px-3 py-3">Building SF</th>
                        <th className="min-w-[180px] px-3 py-3">Owner / tenant</th>
                        <th className="min-w-[150px] px-3 py-3">Map status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {rows.map((row, index) => (
                        <tr key={`${row.sourceSheet}-${row.sourceRow}-${normalizePursuitAddress(row.address)}`} className={row.selected ? '' : 'bg-slate-50/70 text-slate-500'}>
                          <td className="px-3 py-3 align-top">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={Boolean(row.duplicateReason)}
                              onChange={() => toggleRow(index)}
                              aria-label={`Import ${row.address}`}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-3 align-top">
                            <p className="font-medium text-slate-900">{row.formattedAddress || row.address}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{row.submarket || `Spreadsheet row ${row.sourceRow}`}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 align-top text-slate-700">{formatNumber(row.buildingSf)}</td>
                          <td className="px-3 py-3 align-top">
                            <p className="text-slate-700">{row.ownerCompany || '—'}</p>
                            {row.contactName && <p className="mt-0.5 text-xs text-slate-500">{row.contactName}</p>}
                            {row.tenantName && <p className="mt-0.5 text-xs font-medium text-violet-700">Tenant: {row.tenantName}</p>}
                            {row.leaseExpirationDate && <p className="mt-0.5 text-xs text-slate-500">Expires {row.leaseExpirationDate}</p>}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <RowStatus row={row} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {isLocating && (
                <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Locating address {locateProgress.complete} of {locateProgress.total}…
                </div>
              )}
              {unresolvedRows.some((row) => Boolean(row.geocodeError)) && !isLocating && (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  Uncheck unresolved rows or correct their addresses in Excel and upload again.
                </div>
              )}
            </div>
          )}
        </div>

        <ModalFooter className="border-t border-slate-200 bg-white px-6 py-4">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLocating || importMutation.isPending}>
            Cancel
          </Button>
          {hasRows && unresolvedRows.length > 0 ? (
            <Button type="button" className="gap-2" onClick={locateSelectedRows} disabled={!canImport || isLocating || importMutation.isPending}>
              {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {isLocating ? 'Locating…' : `Locate ${unresolvedRows.length} address${unresolvedRows.length === 1 ? '' : 'es'}`}
            </Button>
          ) : hasRows ? (
            <Button type="button" className="gap-2" onClick={() => importMutation.mutate()} disabled={!canSubmit}>
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importMutation.isPending ? 'Importing…' : `Import ${readyRows.length} asset${readyRows.length === 1 ? '' : 's'}`}
            </Button>
          ) : null}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function SummaryCard({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'blue' | 'green' | 'amber' }) {
  const classes = {
    slate: 'border-slate-200 bg-white text-slate-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${classes}`}>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs font-medium opacity-70">{label}</p>
    </div>
  );
}

function RowStatus({ row }: { row: PreparedPursuitImportRow }) {
  const label = rowLocationLabel(row);
  if (row.duplicateReason) {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"><AlertCircle className="h-3.5 w-3.5" />{label}</span>;
  }
  if (row.updateReason) {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-800"><CheckCircle2 className="h-3.5 w-3.5" />{label}</span>;
  }
  if (row.latitude !== null && row.longitude !== null) {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />{label}</span>;
  }
  if (row.geocodeError) {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800"><XCircle className="h-3.5 w-3.5" />{label}</span>;
  }
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"><MapPin className="h-3.5 w-3.5" />{label}</span>;
}
