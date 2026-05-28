import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalClose } from '@/components/primitives/Modal';

type ShareEntry = {
  userId?: string;
  id?: string;
  email?: string | null;
  role: 'owner'|'editor'|'viewer';
  status?: 'pending'|'accepted'|'revoked';
  kind?: 'member'|'invite';
  emailDelivery?: 'sent'|'not_configured'|'failed';
};

function errorMessage(err: any): string {
  const raw = String(err?.message || '');
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const payload = JSON.parse(raw.slice(jsonStart));
      if (payload?.message) return payload.message;
      if (payload?.error) return payload.error;
    } catch {}
  }
  return raw || 'Failed to invite';
}

export function ShareWorkspaceDialog({ listingId, open, onOpenChange, canManage }: { listingId: string; open: boolean; onOpenChange: (v: boolean) => void; canManage: boolean; }) {
  const qc = useQueryClient();
  const { isDemoMode } = useAuth();
  const { toast } = useToast();
  const { data: members = [] } = useQuery<ShareEntry[]>({ queryKey: ['/api/listings', listingId, 'members'], enabled: open && !!listingId });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'viewer'|'editor'>('viewer');

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/listings/${listingId}/members`, { email: inviteEmail.trim(), role: inviteRole });
      return res.json();
    },
    onSuccess: (member: ShareEntry) => {
      qc.setQueryData<ShareEntry[]>(['/api/listings', listingId, 'members'], (prev) => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const idx = arr.findIndex((m) => (
          member.kind === 'invite'
            ? m.kind === 'invite' && m.id === member.id
            : m.userId === member.userId
        ));
        if (idx === -1) arr.push(member); else arr[idx] = member;
        return arr;
      });
      setInviteEmail('');
      setInviteRole('viewer');
      toast({
        title: member.kind === 'invite' ? 'Invite pending' : 'Workspace shared',
        description: member.kind === 'invite'
          ? member.emailDelivery === 'sent'
            ? 'Email sent. They will get access once they sign in with this email.'
            : 'They will get access once they sign in with this email. Email delivery is not configured yet.'
          : `${member.email || member.userId} now has ${member.role} access.`,
      });
    },
    onError: async (err: any) => {
      const msg = errorMessage(err);
      toast({ title: 'Invite failed', description: msg, variant: 'destructive' });
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'viewer'|'editor'|'owner' }) => {
      const res = await apiRequest('PATCH', `/api/listings/${listingId}/members/${userId}`, { role });
      if (!res.ok) throw new Error('Failed');
      return { userId, role };
    },
    onMutate: async ({ userId, role }) => {
      const key = ['/api/listings', listingId, 'members'];
      const prev = qc.getQueryData<ShareEntry[]>(key) || [];
      qc.setQueryData<ShareEntry[]>(key, prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
      return { prev };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(['/api/listings', listingId, 'members'], ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['/api/listings', listingId, 'members'] }); }
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest('DELETE', `/api/listings/${listingId}/members/${userId}`);
      if (!res.ok) throw new Error('Failed');
      return userId;
    },
    onMutate: async (userId) => {
      const key = ['/api/listings', listingId, 'members'];
      const prev = qc.getQueryData<ShareEntry[]>(key) || [];
      qc.setQueryData<ShareEntry[]>(key, prev.filter((m) => m.userId !== userId));
      return { prev };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(['/api/listings', listingId, 'members'], ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['/api/listings', listingId, 'members'] }); }
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await apiRequest('DELETE', `/api/listings/${listingId}/invites/${inviteId}`);
      if (!res.ok) throw new Error('Failed');
      return inviteId;
    },
    onMutate: async (inviteId) => {
      const key = ['/api/listings', listingId, 'members'];
      const prev = qc.getQueryData<ShareEntry[]>(key) || [];
      qc.setQueryData<ShareEntry[]>(key, prev.filter((m) => m.id !== inviteId));
      return { prev };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(['/api/listings', listingId, 'members'], ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['/api/listings', listingId, 'members'] }); }
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Share Workspace</ModalTitle>
        </ModalHeader>
        <div className="space-y-4">
          {isDemoMode && (
            <div className="text-sm p-2 rounded border bg-amber-50 text-amber-900 border-amber-200">
              Demo mode: sharing is local-only and does not carry over to Google sign-in. Invites are disabled.
            </div>
          )}
          {/* Invite */}
          <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>Email</Label>
                <Input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inviteEmail.trim() && !addMutation.isPending) {
                      addMutation.mutate();
                    }
                  }}
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={() => addMutation.mutate()} disabled={!inviteEmail.trim() || addMutation.isPending} title={isDemoMode ? 'Demo mode: invites disabled (server will reject)' : undefined}>Invite</Button>
            </div>

          {/* Members list */}
          <div className="border rounded">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 text-xs font-medium text-gray-500 border-b"> 
              <div>Member</div><div>Role</div><div></div>
            </div>
            <div className="max-h-72 overflow-auto">
              {members.map((m) => {
                const isInvite = m.kind === 'invite' || m.status === 'pending';
                const key = isInvite ? `invite-${m.id || m.email}` : `member-${m.userId}`;
                return (
                <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2 border-b last:border-b-0">
                  <div className="text-sm">
                    {m.email || m.userId}
                    {m.role === 'owner' && <span className="ml-2 text-xs text-gray-500">(Owner)</span>}
                    {isInvite && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">Pending</span>}
                  </div>
                  <div>
                    {m.role === 'owner' || isInvite ? (
                      <span className="text-xs">{m.role}</span>
                    ) : (
                      <Select value={m.role} onValueChange={(role) => updateRoleMutation.mutate({ userId: m.userId!, role: role as any })} disabled={!canManage}>
                        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">viewer</SelectItem>
                          <SelectItem value="editor">editor</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="flex items-center justify-end">
                    {isInvite && canManage && m.id && (
                      <Button variant="ghost" size="icon" onClick={() => revokeInviteMutation.mutate(m.id!)} aria-label="Revoke invite">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    {!isInvite && m.role !== 'owner' && canManage && m.userId && (
                      <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(m.userId!)} aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )})}
            </div>
          </div>
        </div>
        <ModalClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close"
          >
            <span aria-hidden className="inline-block h-4 w-4">✕</span>
          </button>
        </ModalClose>
      </ModalContent>
    </Modal>
  );
}

export default ShareWorkspaceDialog;
