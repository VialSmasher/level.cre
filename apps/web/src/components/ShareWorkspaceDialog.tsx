import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle2, Clock3, Mail, Trash2, Users, X } from 'lucide-react';
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

function deliveryMessage(status: ShareEntry['emailDelivery']): string {
  if (status === 'sent') return 'Invitation emailed';
  if (status === 'failed') return 'Email delivery failed';
  return 'Copy and share the pursuit link';
}

export function ShareWorkspaceDialog({ listingId, open, onOpenChange, canManage }: { listingId: string; open: boolean; onOpenChange: (v: boolean) => void; canManage: boolean; }) {
  const qc = useQueryClient();
  const { isDemoMode } = useAuth();
  const { toast } = useToast();
  const { data: membersResponse = [], refetch: refetchMembers } = useQuery<ShareEntry[]>({ queryKey: ['/api/listings', listingId, 'members'], enabled: open && !!listingId });
  const members = Array.isArray(membersResponse) ? membersResponse : [];

  useEffect(() => {
    if (open && listingId) void refetchMembers();
  }, [listingId, open, refetchMembers]);

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
        title: member.kind === 'invite' ? 'Invitation sent' : 'Pursuit shared',
        description: member.kind === 'invite'
          ? member.emailDelivery === 'sent'
            ? 'Email sent. They will get access once they sign in with this email.'
            : 'They will get access once they sign in with this email. Email delivery is not configured yet.'
          : `${member.email || member.userId} now has ${member.role} access to this pursuit.`,
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
      <ModalContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <ModalHeader className="border-b border-slate-200 px-6 py-5 pr-14">
          <div className="flex items-start gap-3 text-left">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
              <Users className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <ModalTitle className="text-xl text-slate-950">Share pursuit</ModalTitle>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Invite colleagues using the work email they will use to sign in to Level CRE.
              </p>
            </div>
          </div>
        </ModalHeader>
        <div className="space-y-5 px-6 py-5">
          {isDemoMode && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              Sharing is unavailable in the demo. Sign in to invite your team.
            </div>
          )}
          {/* Invite */}
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (inviteEmail.trim() && !addMutation.isPending) addMutation.mutate();
            }}
          >
              <div className="min-w-0">
                <Label htmlFor="pursuit-invite-email">Work email</Label>
                <Input
                  id="pursuit-invite-email"
                  type="email"
                  autoComplete="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  disabled={!canManage || isDemoMode || addMutation.isPending}
                  required
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="pursuit-invite-role">Access</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                  <SelectTrigger id="pursuit-invite-role" className="w-full" aria-label="Invite permission" disabled={!canManage || isDemoMode || addMutation.isPending}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={!canManage || isDemoMode || !inviteEmail.trim() || addMutation.isPending}>
                <Mail className="h-4 w-4" aria-hidden />
                {addMutation.isPending ? 'Sending...' : 'Send invite'}
              </Button>
          </form>

          <p className="-mt-2 text-xs leading-5 text-slate-500">
            Editors can add and update prospects. Viewers can review the pursuit without making changes.
          </p>

          {/* Members list */}
          <div className="overflow-hidden rounded-md border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">People and invitations</h3>
              <span className="text-xs text-slate-500">{members.length} {members.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            <div className="max-h-72 overflow-auto">
              {members.map((m) => {
                const isInvite = m.kind === 'invite' || m.status === 'pending';
                const key = isInvite ? `invite-${m.id || m.email}` : `member-${m.userId}`;
                return (
                <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      {isInvite ? <Clock3 className="h-4 w-4 shrink-0 text-amber-600" aria-hidden /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
                      <span className="truncate text-sm font-medium text-slate-900">{m.email || m.userId}</span>
                      {m.role === 'owner' && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Owner</span>}
                    </div>
                    {isInvite && (
                      <p className={`mt-1 pl-6 text-xs ${m.emailDelivery === 'failed' ? 'text-red-700' : 'text-slate-500'}`}>
                        Pending sign-in · {deliveryMessage(m.emailDelivery)}
                      </p>
                    )}
                  </div>
                  <div>
                    {m.role === 'owner' || isInvite ? (
                      <span className="text-xs font-medium capitalize text-slate-600">{m.role}</span>
                    ) : (
                      <Select value={m.role} onValueChange={(role) => updateRoleMutation.mutate({ userId: m.userId!, role: role as any })} disabled={!canManage}>
                        <SelectTrigger className="w-[120px]" aria-label={`Permission for ${m.email || m.userId}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="flex items-center justify-end">
                    {isInvite && canManage && m.id && (
                      <Button variant="ghost" size="icon" onClick={() => revokeInviteMutation.mutate(m.id!)} aria-label={`Revoke invitation for ${m.email || 'this email'}`} title="Revoke invitation">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    {!isInvite && m.role !== 'owner' && canManage && m.userId && (
                      <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(m.userId!)} aria-label={`Remove ${m.email || 'member'} from pursuit`} title="Remove access">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )})}
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Access is granted only when the recipient signs in with the exact email shown above.
          </p>
        </div>
        <ModalClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </ModalClose>
      </ModalContent>
    </Modal>
  );
}

export default ShareWorkspaceDialog;
