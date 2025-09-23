import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Archive, Trash2 } from 'lucide-react';

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
  const [title, setTitle] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = { title: title.trim() };
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
      toast({ title: 'Workspace created', description: 'Opening workspace...' });
      try {
        localStorage.setItem('lastWorkspaceId', listing.id);
        localStorage.setItem('lastListingsLocation', `/app/listings/${listing.id}`);
      } catch {}
      setLocation(`/app/listings/${listing.id}`);
    },
    onError: async (err: any) => {
      const message = err?.message || 'Failed to create workspace';
      toast({ title: 'Could not create workspace', description: message, variant: 'destructive' });
    }
  });

  const canSubmit = !!title.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}

export default function ListingsIndex() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: listings = [], isLoading } = useQuery<ListingRow[]>({ queryKey: ['/api/listings'] });

  // Remember the last place inside the Workspaces section
  useEffect(() => {
    try { localStorage.setItem('lastListingsLocation', '/app/listings'); } catch {}
  }, []);

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <Button onClick={() => setOpen(true)}>Create Workspace</Button>
      </div>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="space-y-3">
          {listings.length === 0 && (
            <Card>
              <CardHeader><CardTitle>No workspaces yet</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">Create your first workspace to start scoping prospects.</p>
              </CardContent>
            </Card>
          )}
          {listings.map(l => (
            <Card
              key={l.id}
              className="hover:border-blue-300 cursor-pointer"
              onClick={() => {
                try {
                  localStorage.setItem('lastWorkspaceId', l.id);
                  localStorage.setItem('lastListingsLocation', `/app/listings/${l.id}`);
                } catch {}
                setLocation(`/app/listings/${l.id}`)
              }}
            >
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">{l.title || l.address}</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{new Date(l.createdAt || Date.now()).toLocaleDateString()}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Archive workspace"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); archiveMutation.mutate(l.id); }}
                    disabled={archiveMutation.isPending}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-600 hover:text-red-700"
                    title="Delete workspace"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (confirm('Delete this workspace? This cannot be undone.')) {
                        deleteMutation.mutate(l.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-6 text-sm text-gray-700">
                  <div><span className="font-medium">Prospects:</span> {l.prospectCount}</div>
                  <div><span className="font-medium">Created:</span> {new Date(l.createdAt || Date.now()).toLocaleDateString()}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateWorkspaceModal open={open} onOpenChange={setOpen} />
    </div>
  );
}
