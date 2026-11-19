import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import { ArrowLeft, ArrowRight, Building2, ExternalLink, Linkedin, Mail, Network, Pencil, Phone, Plus, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
type Company = {
    id: string;
    name: string;
    recordName: string;
    address: string | null;
    contactName: string | null;
};
type Broker = {
    id: string;
    name: string;
    firm: string;
    office: string;
    email: string;
    phone: string;
    linkedinUrl: string;
    sourceUrl: string;
    notes: string;
    version: number;
    archived: boolean;
};
type Contact = {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    company: string | null;
    isPrimary: boolean;
};
type Relationship = {
    id: string;
    brokerId: string;
    prospectId: string;
    brokerName: string;
    companyName: string;
    recordName: string;
    firm: string;
    status: string;
    scope: string;
    notes: string;
    sourceUrl: string;
    learnedOn: string;
    version: number;
    archived: boolean;
};
type Directory = {
    companies: Company[];
    brokers: Broker[];
    moreCompanies: boolean;
    moreBrokers: boolean;
};
type Detail = {
    broker?: Broker;
    prospect?: {
        id: string;
        name: string;
        businessName: string | null;
        address: string | null;
    };
    contacts?: Contact[];
    relationships: Relationship[];
};
type Editor = {
    kind: 'broker' | 'contact' | 'relationship';
    values: Record<string, any>;
};
const base = '/api/desk/directory';
const statuses: Record<string, string> = { unverified: 'To verify', active: 'Current relationship', historical: 'Past transaction', ended: 'Relationship ended' };
const blankBroker = { name: '', firm: 'Cushman & Wakefield', office: '', email: '', phone: '', linkedinUrl: '', sourceUrl: '', notes: '', version: 0, archived: false };
const today = () => new Date().toLocaleDateString('en-CA');
const request = async <T,>(path: string): Promise<T> => (await apiRequest('GET', path)).json();
function ContactLinks({ name, company, email, phone, linkedinUrl }: {
    name: string;
    company: string;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string;
}) {
    const linkedin = linkedinUrl || 'https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent(name + ' ' + company);
    return <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
    {email && <a className="inline-flex items-center gap-1.5 break-all text-blue-700 hover:underline" href={'mailto:' + encodeURIComponent(email)}><Mail className="h-3.5 w-3.5 shrink-0"/>{email}</a>}
    {phone && <a className="inline-flex items-center gap-1.5 text-slate-700 hover:underline" href={'tel:' + phone.replace(/[^\d+]/g, '')}><Phone className="h-3.5 w-3.5"/>{phone}</a>}
    {name && <a className="inline-flex items-center gap-1.5 text-blue-700 hover:underline" href={linkedin} target="_blank" rel="noopener noreferrer"><Linkedin className="h-3.5 w-3.5"/>{linkedinUrl ? 'LinkedIn profile' : 'Find on LinkedIn'}<ExternalLink className="h-3 w-3"/></a>}
  </div>;
}
function Field({ name, label, value, onChange, required = false, type = 'text' }: {
    name: string;
    label: string;
    value: string;
    onChange: (name: string, value: string) => void;
    required?: boolean;
    type?: string;
}) {
    return <div className="space-y-1.5"><Label htmlFor={'field-' + name}>{label}</Label><Input id={'field-' + name} name={name} value={value || ''} onChange={e => onChange(name, e.target.value)} required={required} type={type} maxLength={name === 'sourceUrl' || name === 'linkedinUrl' ? 2000 : 320}/></div>;
}
function EditDialog({ editor, detail, close, saved }: {
    editor: Editor;
    detail?: Detail;
    close: () => void;
    saved: (kind: string, id: string, archived: boolean) => void;
}) {
    const [values, setValues] = useState(editor.values);
    const [search, setSearch] = useState('');
    const options = useQuery<Directory>({ queryKey: [base, 'choices', search], queryFn: () => request(base + '?search=' + encodeURIComponent(search)), enabled: editor.kind === 'relationship' && !editor.values.version });
    const change = (key: string, value: string) => setValues(previous => ({ ...previous, [key]: value }));
    const mutation = useMutation({
        mutationFn: async () => {
            const { id, ...input } = values;
            let url = base + '/brokers/' + id;
            let method = 'PUT';
            let body: Record<string, any> = input;
            if (editor.kind === 'contact') {
                url = '/api/calling/prospects/' + detail!.prospect!.id + '/contacts' + (id ? '/' + id : '');
                method = id ? 'PATCH' : 'POST';
                body = { name: input.name, title: input.title, company: input.company, email: input.email, phone: input.phone };
            }
            if (editor.kind === 'relationship') {
                url = base + '/relationships/' + id;
                body = Object.fromEntries(['brokerId', 'prospectId', 'status', 'scope', 'notes', 'sourceUrl', 'learnedOn', 'version', 'archived'].map(key => [key, input[key]]));
            }
            if (editor.kind === 'broker')
                body = Object.fromEntries(Object.keys(blankBroker).map(key => [key, input[key]]));
            await apiRequest(method, url, body);
            return id || detail!.prospect!.id;
        },
        onSuccess: id => saved(editor.kind, id, Boolean(values.archived)),
    });
    const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
    const isNewLink = editor.kind === 'relationship' && !editor.values.version;
    const chooseCompany = Boolean(detail?.broker);
    const choiceRows = chooseCompany ? options.data?.companies : options.data?.brokers;
    const choiceKey = chooseCompany ? 'prospectId' : 'brokerId';
    return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending)
        close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{editor.values.version || editor.values.id && editor.kind === 'contact' ? 'Edit' : 'Add'} {editor.kind === 'relationship' ? 'account connection' : editor.kind === 'broker' ? 'broker' : 'company contact'}</DialogTitle>
        <DialogDescription>{editor.kind === 'relationship' ? 'Record the scope and what supports this connection.' : 'Save contact details in your private Level CRE workspace.'}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {editor.kind === 'relationship' ? <>
          {isNewLink && <div className="space-y-2"><Label htmlFor="choice-search">Find {chooseCompany ? 'a company' : 'a broker'}</Label>
            <Input id="choice-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name"/>
            {options.isError && <p role="alert" className="text-sm text-red-700">Could not load choices. Close and try again.</p>}
            <select aria-label={chooseCompany ? 'Company account' : 'Broker'} required className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={values[choiceKey] || ''} onChange={e => change(choiceKey, e.target.value)}>
              <option value="">Select {chooseCompany ? 'company account' : 'broker'}</option>
              {choiceRows?.map(row => <option key={row.id} value={row.id}>{row.name}{'recordName' in row && row.recordName !== row.name ? ' · ' + row.recordName : ''}</option>)}
            </select>
            {!chooseCompany && !options.isLoading && !options.data?.brokers.length && <p className="text-xs text-slate-500">Add a broker to the directory first.</p>}
          </div>}
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="status">Relationship</Label><select id="status" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={values.status} onChange={e => change('status', e.target.value)}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
            <Field name="learnedOn" label="Date learned" value={values.learnedOn} onChange={change} required type="date"/></div>
          <Field name="scope" label="Account scope or market" value={values.scope} onChange={change}/>
          <p className="text-xs text-slate-500">For example, national tenant representation or a past Atlanta assignment.</p>
        </> : <>
          <Field name="name" label="Full name" value={values.name} onChange={change} required={editor.kind === 'broker' || !values.isPrimary}/>
          <div className="grid gap-4 sm:grid-cols-2">
            {editor.kind === 'broker' ? <><Field name="firm" label="Brokerage" value={values.firm} onChange={change} required/><Field name="office" label="Office or market" value={values.office} onChange={change}/></> : <><Field name="company" label="Company" value={values.company} onChange={change}/><Field name="title" label="Title" value={values.title} onChange={change}/></>}
            <Field name="email" label="Work email" value={values.email} onChange={change} type="email"/>
            <Field name="phone" label="Phone" value={values.phone} onChange={change} type="tel"/>
          </div>
          {editor.kind === 'broker' && <Field name="linkedinUrl" label="LinkedIn profile URL" value={values.linkedinUrl} onChange={change} type="url"/>}
        </>}
        {editor.kind !== 'contact' && <>
          <Field name="sourceUrl" label="Source link" value={values.sourceUrl} onChange={change} type="url"/>
          <div className="space-y-1.5"><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={values.notes} onChange={e => change('notes', e.target.value)} maxLength={4000} rows={3}/></div>
          {editor.values.version > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.archived} onChange={e => setValues(v => ({ ...v, archived: e.target.checked }))}/>Archive this {editor.kind === 'broker' ? 'broker and hide their connections' : 'connection'}</label>}
        </>}
        {mutation.isError && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{mutation.error.message}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={mutation.isPending}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
export default function RelationshipDirectory() {
    const [, navigate] = useLocation();
    const params = new URLSearchParams(useSearch());
    const selectedBroker = params.get('broker');
    const selectedCompany = params.get('company');
    const [mode, setMode] = useState<'companies' | 'brokers'>(selectedBroker ? 'brokers' : 'companies');
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [editor, setEditor] = useState<Editor | null>(null);
    const [notice, setNotice] = useState('');
    const [browseOpen, setBrowseOpen] = useState(false);
    const queryClient = useQueryClient();
    useEffect(() => { const timer = setTimeout(() => setDebounced(search), 180); return () => clearTimeout(timer); }, [search]);
    const directory = useQuery<Directory>({ queryKey: [base, debounced], queryFn: () => request(base + '?search=' + encodeURIComponent(debounced)) });
    const selectedId = selectedBroker || selectedCompany;
    const path = base + (selectedBroker ? '/brokers/' : '/companies/') + encodeURIComponent(selectedId || '');
    const detailQuery = useQuery<Detail>({ queryKey: [base, 'detail', path], queryFn: () => request(path), enabled: Boolean(selectedId) });
    const detail = detailQuery.data;
    const selected = detail?.broker;
    const name = selected?.name || detail?.prospect?.businessName || detail?.contacts?.find(c => c.company)?.company || detail?.prospect?.name;
    const rows = directory.data?.[mode] || [];
    const choose = (type: 'company' | 'broker', id: string) => {
        setMode(type === 'company' ? 'companies' : 'brokers');
        setNotice('');
        setBrowseOpen(false);
        navigate('/app/desk/relationships?' + type + '=' + encodeURIComponent(id));
    };
    const openBroker = (broker?: Broker) => setEditor({ kind: 'broker', values: broker ? { ...broker } : { ...blankBroker, id: crypto.randomUUID() } });
    const openContact = (contact?: Contact) => setEditor({ kind: 'contact', values: contact ? { ...contact } : { name: '', email: '', phone: '', company: name || '', title: '' } });
    const openLink = (relationship?: Relationship) => setEditor({ kind: 'relationship', values: relationship ? { ...relationship } : {
            id: crypto.randomUUID(), brokerId: selectedBroker || '', prospectId: detail?.prospect?.id || '',
            status: 'unverified', scope: '', notes: '', sourceUrl: '', learnedOn: today(), version: 0, archived: false,
        } });
    const saved = async (kind: string, id: string, archived: boolean) => {
        setEditor(null);
        await queryClient.invalidateQueries({ queryKey: [base] });
        await queryClient.invalidateQueries({ queryKey: ['/api/calling'] });
        setNotice('Saved to your private directory.');
        if (kind === 'broker' && !archived)
            choose('broker', id);
        if (kind === 'broker' && archived)
            navigate('/app/desk/relationships');
    };
    return <div className="min-h-full bg-[#f3f5f7]">
    <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
      <Link href="/app/desk" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-700"><ArrowLeft className="h-3.5 w-3.5"/>Daily Desk</Link>
      <PageHeader label="Broker desk" title="Contacts & relationships" description="Your company contacts and the brokers connected to each account." icon={Network} actions={<Button size="sm" onClick={() => openBroker()}><Plus className="h-4 w-4"/>Add broker</Button>}/>
      <p className="sr-only" role="status">{notice}</p>
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border border-slate-200 bg-white">
          {selectedId && <button className="w-full px-4 py-3 text-left text-sm font-semibold text-blue-700 lg:hidden" onClick={() => setBrowseOpen(!browseOpen)} aria-expanded={browseOpen} aria-controls="directory-browser">{browseOpen ? 'Close directory' : 'Browse companies & brokers'}</button>}
          <div id="directory-browser" className={cn(selectedId && !browseOpen && 'hidden lg:block')}>
          <div className="flex border-b border-slate-200" role="group" aria-label="Directory type">{(['companies', 'brokers'] as const).map(value => <button key={value} className={cn('flex-1 border-b-2 px-4 py-3 text-sm font-semibold', mode === value ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:bg-slate-50')} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'companies' ? 'Companies' : 'Brokers'}</button>)}</div>
          <div className="relative m-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><Input className="pl-9" aria-label="Search directory" placeholder={'Find ' + mode} value={search} onChange={e => setSearch(e.target.value)}/></div>
          {directory.isLoading && <p className="p-4 text-sm text-slate-500">Loading directory…</p>}
          {directory.isError && <div role="alert" className="p-4 text-sm text-red-700">Could not load the directory.<Button variant="ghost" onClick={() => directory.refetch()}>Retry</Button></div>}
          {!directory.isLoading && !directory.isError && !rows.length && <p className="p-4 text-sm text-slate-500">{mode === 'brokers' ? 'Add a broker to start connecting accounts.' : 'No matching company records.'}</p>}
          <nav aria-label="Directory results" className="max-h-60 overflow-y-auto lg:max-h-[65vh]">{rows.map(row => <button key={row.id} onClick={() => choose(mode === 'companies' ? 'company' : 'broker', row.id)} className={cn('flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left', selectedId === row.id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50')}>
            {mode === 'companies' ? <Building2 className="h-4 w-4 shrink-0 text-slate-500"/> : <Users className="h-4 w-4 shrink-0 text-slate-500"/>}
            <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{row.name}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{'office' in row ? row.office || row.firm : row.address || row.recordName}</span></span>
          </button>)}</nav>
          {(mode === 'companies' ? directory.data?.moreCompanies : directory.data?.moreBrokers) && <p className="border-t p-3 text-xs text-slate-500">Showing the first 100. Search to narrow the list.</p>}
          </div>
        </aside>
        <div className="min-w-0">
          {!selectedId && <section className="border-y border-slate-200 bg-white px-6 py-10"><h2 className="text-lg font-semibold text-slate-900">Open a company or broker</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">Company contacts come from your existing Level CRE records. Add brokers, record what you learn, and follow their connections between accounts.</p></section>}
          {detailQuery.isLoading && selectedId && <p className="p-5 text-sm text-slate-500">Loading contact details…</p>}
          {detailQuery.isError && <div role="alert" className="border border-red-200 bg-white p-5 text-sm text-red-700">This record could not be opened. It may have been merged or archived.<Button variant="ghost" onClick={() => detailQuery.refetch()}>Retry</Button></div>}
          {detail && <>
            <section className="border-b border-slate-300 pb-5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase text-slate-500">{selected ? selected.firm : 'Company record'}</p><h2 className="mt-1 text-2xl font-semibold text-slate-950">{name}</h2><p className="mt-1 text-sm text-slate-600">{selected ? selected.office : detail.prospect?.address || detail.prospect?.name}</p></div>
                {selected && <Button variant="outline" size="sm" onClick={() => openBroker(selected)}><Pencil className="h-3.5 w-3.5"/>Edit broker</Button>}</div>
              {selected && <><ContactLinks company={selected.firm} {...selected}/>
                {!selected.email && !selected.phone && <p className="mt-3 text-xs text-slate-500">Add this broker’s email or phone through Edit broker.</p>}
                {selected.notes && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selected.notes}</p>}
                {selected.sourceUrl && <a className="mt-2 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline" href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Contact source<ExternalLink className="h-3 w-3"/></a>}</>}
            </section>
            {!selected && <section className="mt-5 border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold">Company contacts</h3><Button size="sm" variant="outline" onClick={() => openContact()}><Plus className="h-3.5 w-3.5"/>Add contact</Button></div>
              {detail.contacts?.map(contact => <div key={contact.id} className="border-b border-slate-100 px-4 py-4 last:border-0"><div className="flex items-start justify-between gap-2"><div><h4 className="text-sm font-semibold">{contact.name || 'Primary contact details'}</h4><p className="mt-0.5 text-xs text-slate-500">{contact.title || (contact.isPrimary ? 'Primary contact' : contact.company)}</p></div><Button variant="ghost" size="sm" aria-label={'Edit ' + (contact.name || 'primary contact')} onClick={() => openContact(contact)}><Pencil className="h-3.5 w-3.5"/></Button></div>
                <ContactLinks name={contact.name || ''} company={name || ''} email={contact.email} phone={contact.phone}/></div>)}
            </section>}
            <section className="mt-5 border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-blue-600"/>{selected ? 'Connected accounts' : 'Broker relationships'}</h3><Button variant="outline" size="sm" onClick={() => openLink()}><Plus className="h-3.5 w-3.5"/>Link {selected ? 'account' : 'broker'}</Button></div>
              {!detail.relationships.length && <p className="px-4 py-6 text-sm text-slate-500">Add a connection as you learn who works with this {selected ? 'broker' : 'company'}.</p>}
              <div className="divide-y divide-slate-200">{detail.relationships.map(link => <div key={link.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3"><button onClick={() => choose(selected ? 'company' : 'broker', selected ? link.prospectId : link.brokerId)} className="group flex items-center gap-2 text-left text-sm font-semibold text-blue-700 hover:underline">{selected ? link.companyName : link.brokerName}<ArrowRight className="h-3.5 w-3.5 shrink-0"/></button><Button variant="ghost" size="sm" aria-label={'Edit connection for ' + (selected ? link.companyName : link.brokerName)} onClick={() => openLink(link)}><Pencil className="h-3.5 w-3.5"/></Button></div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs"><span className={link.status === 'active' ? 'font-medium text-emerald-700' : 'font-medium text-slate-600'}>{statuses[link.status]}</span><span className="text-slate-500">{link.scope || 'Scope to be confirmed'}</span></div>
                {link.notes && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{link.notes}</p>}
                <p className="mt-2 text-xs text-slate-400">Learned {link.learnedOn}{link.sourceUrl && <> · <a className="text-blue-700 hover:underline" href={link.sourceUrl} target="_blank" rel="noopener noreferrer">Source ↗</a></>}</p>
              </div>)}</div>
            </section>
          </>}
        </div>
      </div>
    </div>
    {editor && <EditDialog key={editor.kind + (editor.values.id || 'new')} editor={editor} detail={detail} close={() => setEditor(null)} saved={saved}/>}
  </div>;
}
