import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/primitives/Modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { prospectLabel } from '@/lib/copy';
import { useAuth } from '@/contexts/AuthContext';
import { nsKey, readJSON, writeJSON } from '@/lib/storage';
import { ArrowRight, Briefcase, CalendarDays, MoreHorizontal, Pencil, Plus, Share2, Trash2, Users } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ListingRow = {
  id: string;
  userId: string;
  title: string;
  address?: string | null;
  lat?: string | null;
  lng?: string | null;
  submarket?: string | null;
  dealType?: string | null;
  size?: string | null;
  price?: string | null;
  createdAt?: string | Date | null;
  archivedAt?: string | Date | null;
  prospectCount: number;
}

const formatDate = (value?: string | Date | null) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

function WorkspaceCard({
  workspace,
  kind,
  onOpen,
  onRename,
  onShare,
  onDelete,
  deleteDisabled,
}: {
  workspace: ListingRow;
  kind: 'owned' | 'shared';
  onOpen: () => void;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
}) {
  const count = workspace.prospectCount ?? 0;
  const name = workspace.title || workspace.address || 'Untitled workspace';

  return (
    <Card
      className="group relative cursor-pointer overflow-hidden border-border bg-card shadow-none transition-colors hover:border-slate-400"
      onClick={onOpen}
    >
      <CardHeader className="space-y-0 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-slate-700">
              {kind === 'shared' ? <Users className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-sm leading-5 text-foreground" title={name}>
                {name}
              </CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-border bg-background px-2 py-0 text-xs text-slate-600">
                  {kind === 'shared' ? 'Shared' : 'Workspace'}
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(workspace.createdAt)}
                </span>
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                aria-label="Workspace actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRename(); }}>
                <Pencil className="mr-2 h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShare(); }}>
                <Share2 className="mr-2 h-4 w-4" /> Share
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 focus:text-red-700"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
                disabled={deleteDisabled}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-semibold text-foreground">{count}</p>
            <p className="text-xs text-muted-foreground">{prospectLabel(count)}</p>
          </div>
          <div className="inline-flex items-center gap-1 text-sm font-medium text-primary opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
            Open
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateWorkspaceModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user, isDemoMode } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');

  const genId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const createMutation = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim();
      if (isDemoMode) {
        const listing = {
          id: genId(),
          userId: user?.id || 'demo-user',
          title: trimmed,
          address: null,
          lat: null,
          lng: null,
          submarket: null,
          dealType: null,
          size: null,
          price: null,
          createdAt: new Date().toISOString(),
          archivedAt: null,
          prospectCount: 0,
        } as any;
        return listing;
      }
      const payload = { title: trimmed };
      const res = await apiRequest('POST', '/api/listings', payload);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const body = await res.text();
        throw new Error('API did not return JSON for create. ' +
          'Ensure the backend is running and that you\'re authenticated or in Demo Mode.');
      }
      return res.json();
    },
    onSuccess: (listing: any) => {
      onOpenChange(false);
      setTitle('');
      toast({ title: isDemoMode ? 'Workspace created (demo)' : 'Workspace created', description: 'Opening workspace...' });

      // In demo mode, cache + persist locally so the UI lists and opens it
      if (isDemoMode) {
        try {
          // Update list cache
          queryClient.setQueryData<any[]>(['/api/listings'], (prev) => Array.isArray(prev) ? [...prev, listing] : [listing]);
          // Seed detail + empty prospects for this listing
          queryClient.setQueryData<any>(['/api/listings', listing.id], listing);
          queryClient.setQueryData<any[]>(['/api/listings', listing.id, 'prospects'], (prev) => Array.isArray(prev) ? prev : []);

          // Persist to localStorage under user scope
          const k = nsKey(user?.id, 'listings');
          const existing = readJSON<any[]>(k, []);
          writeJSON(k, [...existing, listing]);
          // Also persist a shared device-wide copy for demo
          const kShared = nsKey(null, 'listings'); // -> 'listings::guest'
          const sharedExisting = readJSON<any[]>(kShared, []);
          writeJSON(kShared, [...sharedExisting, listing]);
        } catch {}
      }
      try {
        localStorage.setItem('lastWorkspaceId', listing.id);
        localStorage.setItem('lastWorkspacesLocation', `/app/workspaces/${listing.id}`);
        // Backwards-compat for older nav state
        localStorage.setItem('lastListingsLocation', `/app/listings/${listing.id}`);
      } catch {}
      setLocation(`/app/workspaces/${listing.id}`);
    },
    onError: async (err: any) => {
      const message = err?.message || 'Failed to create workspace';
      toast({ title: 'Could not create workspace', description: message, variant: 'destructive' });
    }
  });

  const canSubmit = !!title.trim();

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-lg">
        <ModalHeader>
          <ModalTitle>Create Workspace</ModalTitle>
        </ModalHeader>
        <div className="space-y-4">
          <div>
            <Label>Workspace Name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., NW Distributors" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Workspace'}
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}

export default function WorkspacesIndex() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isDemoMode } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: listingsResponse = [], isLoading } = useQuery<ListingRow[]>({ queryKey: ['/api/listings'] });
  const { data: sharedResponse = [], isLoading: isLoadingShared } = useQuery<ListingRow[]>({ queryKey: ['/api/listings', 'shared'], queryFn: async () => {
    const res = await apiRequest('GET', '/api/listings?scope=shared');
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return [] as any;
    const json = await res.json();
    return Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
  }});
  const listings = Array.isArray(listingsResponse) ? listingsResponse : [];
  const shared = Array.isArray(sharedResponse) ? sharedResponse : [];
  const totalOwnedProspects = listings.reduce((sum, item) => sum + Number(item.prospectCount || 0), 0);
  const totalSharedProspects = shared.reduce((sum, item) => sum + Number(item.prospectCount || 0), 0);
  const openWorkspace = (workspace: ListingRow) => {
    try {
      localStorage.setItem('lastWorkspaceId', workspace.id);
      localStorage.setItem('lastWorkspacesLocation', `/app/workspaces/${workspace.id}`);
      localStorage.setItem('lastListingsLocation', `/app/listings/${workspace.id}`);
    } catch {}
    setLocation(`/app/workspaces/${workspace.id}`);
  };

  // Remember the last place inside the Workspaces section
  useEffect(() => {
    try { 
      localStorage.setItem('lastWorkspacesLocation', '/app/workspaces'); 
      // Backwards-compat for older nav state
      localStorage.setItem('lastListingsLocation', '/app/listings'); 
    } catch {}
  }, []);

  // Demo mode: seed listings list from localStorage if present
  useEffect(() => {
    if (!isDemoMode) return;
    try {
      const kUser = nsKey(user?.id, 'listings');
      const kShared = nsKey(null, 'listings'); // device-wide demo list
      const userListings = readJSON<any[]>(kUser, []);
      const sharedListings = readJSON<any[]>(kShared, []);
      const mergedMap: Record<string, any> = {};
      [...sharedListings, ...userListings].forEach(l => { if (l && l.id) mergedMap[l.id] = l; });
      const merged = Object.values(mergedMap);
      if (merged.length > 0) {
        queryClient.setQueryData<any[]>(['/api/listings'], merged as any[]);
      }
    } catch {}
  }, [isDemoMode, user?.id, queryClient]);

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        const when = new Date().toISOString();
        // Update caches
        queryClient.setQueryData<any[]>(['/api/listings'], (prev) => Array.isArray(prev) ? prev.map(l => l.id === id ? { ...l, archivedAt: when } : l) : prev);
        queryClient.setQueryData<any>(['/api/listings', id], (prev) => prev ? { ...prev, archivedAt: when } : prev);
        // Persist user + shared
        const kUser = nsKey(user?.id, 'listings');
        const kShared = nsKey(null, 'listings');
        const upd = (arr: any[]) => arr.map(l => l.id === id ? { ...l, archivedAt: when } : l);
        try { writeJSON(kUser, upd(readJSON<any[]>(kUser, []))); } catch {}
        try { writeJSON(kShared, upd(readJSON<any[]>(kShared, []))); } catch {}
        return { ok: true };
      }
      await apiRequest('POST', `/api/listings/${id}/archive`, {});
      return { ok: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/listings'], refetchType: 'active' });
      toast({ title: 'Workspace archived' });
    },
    onError: (err: any) => {
      toast({ title: 'Could not archive workspace', description: err?.message || 'Unknown error', variant: 'destructive' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        // Update caches
        queryClient.setQueryData<any[]>(['/api/listings'], (prev) => Array.isArray(prev) ? prev.filter(l => l.id !== id) : prev);
        queryClient.removeQueries({ queryKey: ['/api/listings', id], exact: true });
        queryClient.removeQueries({ queryKey: ['/api/listings', id, 'prospects'], exact: true });
        // Persist user + shared
        const kUser = nsKey(user?.id, 'listings');
        const kShared = nsKey(null, 'listings');
        const filt = (arr: any[]) => arr.filter(l => l.id !== id);
        try { writeJSON(kUser, filt(readJSON<any[]>(kUser, []))); } catch {}
        try { writeJSON(kShared, filt(readJSON<any[]>(kShared, []))); } catch {}
        // Remove workspace membership mapping
        try { localStorage.removeItem(nsKey(user?.id, `workspace:${id}:prospectIds`)); } catch {}
        try { localStorage.removeItem(nsKey(null, `workspace:${id}:prospectIds`)); } catch {}
        return { ok: true };
      }
      await apiRequest('DELETE', `/api/listings/${id}`);
      return { ok: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/listings'], refetchType: 'active' });
      toast({ title: 'Workspace deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Could not delete workspace', description: err?.message || 'Unknown error', variant: 'destructive' });
    }
  });

  return (
    <div className="min-h-screen bg-background px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge variant="outline" className="mb-2 gap-2 border-border bg-card px-2.5 py-1 text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" />
            Workspace library
          </Badge>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">Workspace Library</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Organize pursuit maps, shared prospect sets, and client-specific canvassing work.</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={() => setOpen(true)} aria-label="Create Workspace">
              <Plus className="mr-2 h-4 w-4" />
              New workspace
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Create Workspace</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-medium text-slate-600">My workspaces</p>
              <p className="mt-1 text-3xl font-bold text-slate-950">{listings.length}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <Briefcase className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-medium text-slate-600">My prospects</p>
              <p className="mt-1 text-3xl font-bold text-slate-950">{totalOwnedProspects}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <Briefcase className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-medium text-slate-600">Shared prospects</p>
              <p className="mt-1 text-3xl font-bold text-slate-950">{totalSharedProspects}</p>
            </div>
            <div className="rounded-xl bg-violet-50 p-2 text-violet-600">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      ) : (
        <>
          <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">My workspaces</h2>
              <p className="text-sm text-slate-600">Client maps and prospecting boards ready to work.</p>
            </div>
            <Badge variant="outline" className="rounded-full bg-white">{listings.length}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-2">
          {listings.length === 0 && (
            <Card className="col-span-full border-dashed border-slate-300 bg-white">
              <CardHeader>
                <CardTitle>No workspaces yet</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">Create a workspace for a pursuit, client, territory, or listing assignment.</p>
              </CardContent>
            </Card>
          )}

          {listings.map((l) => (
            <WorkspaceCard
              key={l.id}
              workspace={l}
              kind="owned"
              onOpen={() => openWorkspace(l)}
              onRename={() => toast({ title: 'Rename', description: 'Coming soon.' })}
              onShare={() => toast({ title: 'Share', description: 'Coming soon.' })}
              onDelete={() => {
                if (confirm('Delete this workspace? This cannot be undone.')) deleteMutation.mutate(l.id);
              }}
              deleteDisabled={deleteMutation.isPending}
            />
          ))}
          </div>
          </section>

        {/* Shared Section */}
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Shared with me</h2>
              <p className="text-sm text-slate-600">Pursuits and prospect boards other brokers have shared with you.</p>
            </div>
            <Badge variant="outline" className="rounded-full bg-white">{shared.length}</Badge>
          </div>
          {isLoadingShared ? (
            <div className="grid grid-cols-1 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
              ))}
            </div>
          ) : shared.length === 0 ? (
            <Card className="border-dashed border-slate-300 bg-white">
              <CardContent className="p-5 text-sm text-slate-600">No shared workspaces yet.</CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {shared.map((l) => (
                <WorkspaceCard
                  key={l.id}
                  workspace={l}
                  kind="shared"
                  onOpen={() => openWorkspace(l)}
                  onRename={() => toast({ title: 'Rename', description: 'Coming soon.' })}
                  onShare={() => toast({ title: 'Share', description: 'Coming soon.' })}
                  onDelete={() => toast({ title: 'Delete', description: 'Coming soon.' })}
                />
              ))}
            </div>
          )}
        </section>
        </>
      )}

      <CreateWorkspaceModal open={open} onOpenChange={setOpen} />
      </div>
    </div>
  );
}
