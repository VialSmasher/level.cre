import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/primitives/Modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { nsKey, readJSON, writeJSON } from '@/lib/storage';
import { MoreHorizontal, Trash2, Pencil, Share2, Plus } from 'lucide-react';
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
  const { data: listings = [], isLoading } = useQuery<ListingRow[]>({ queryKey: ['/api/listings'] });
  const { data: shared = [], isLoading: isLoadingShared } = useQuery<ListingRow[]>({ queryKey: ['/api/listings', 'shared'], queryFn: async () => {
    const res = await apiRequest('GET', '/api/listings?scope=shared');
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return [] as any;
    return res.json();
  }});

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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" onClick={() => setOpen(true)} aria-label="Create Workspace">
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Create Workspace</p>
          </TooltipContent>
        </Tooltip>
      </div>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.length === 0 && (
            <Card className="col-span-full">
              <CardHeader>
                <CardTitle>No workspaces yet</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Create your first workspace to start scoping prospects.</p>
              </CardContent>
            </Card>
          )}

          {listings.map((l) => (
            <Card
              key={l.id}
              className="group relative cursor-pointer transition-shadow hover:shadow-md hover:border-blue-300"
              onClick={() => {
                try {
                  localStorage.setItem('lastWorkspaceId', l.id);
                  localStorage.setItem('lastWorkspacesLocation', `/app/workspaces/${l.id}`);
                  // Backwards-compat for older nav state
                  localStorage.setItem('lastListingsLocation', `/app/listings/${l.id}`);
                } catch {}
                setLocation(`/app/workspaces/${l.id}`);
              }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg leading-tight truncate">
                    {l.title || l.address}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(l.createdAt || Date.now()).toLocaleDateString()}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          aria-label="Workspace actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toast({ title: 'Rename', description: 'Coming soon.' });
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toast({ title: 'Share', description: 'Coming soon.' });
                          }}
                        >
                          <Share2 className="mr-2 h-4 w-4" /> Share
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-700"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (confirm('Delete this workspace? This cannot be undone.')) {
                              deleteMutation.mutate(l.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Prospects:</span> {l.prospectCount}
                </div>
              </CardContent>
            </Card>
          ))}
          </div>

        {/* Shared Section */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Shared</h2>
          {isLoadingShared ? (
            <div>Loading...</div>
          ) : shared.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shared workspaces yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shared.map((l) => (
                <Card
                  key={l.id}
                  className="group relative cursor-pointer transition-shadow hover:shadow-md hover:border-blue-300"
                  onClick={() => {
                    try {
                      localStorage.setItem('lastWorkspaceId', l.id);
                      localStorage.setItem('lastWorkspacesLocation', `/app/workspaces/${l.id}`);
                      localStorage.setItem('lastListingsLocation', `/app/listings/${l.id}`);
                    } catch {}
                    setLocation(`/app/workspaces/${l.id}`);
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg leading-tight truncate">
                        {l.title || l.address}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(l.createdAt || Date.now()).toLocaleDateString()}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              aria-label="Workspace actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toast({ title: 'Rename', description: 'Coming soon.' });
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toast({ title: 'Share', description: 'Coming soon.' });
                              }}
                            >
                              <Share2 className="mr-2 h-4 w-4" /> Share
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-700"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toast({ title: 'Delete', description: 'Coming soon.' });
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">Prospects: {l.prospectCount ?? 0}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
        </>
      )}

      <CreateWorkspaceModal open={open} onOpenChange={setOpen} />
    </div>
  );
}
