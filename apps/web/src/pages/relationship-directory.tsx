import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import { ArrowLeft, ArrowRight, Building2, ExternalLink, Linkedin, Mail, Network, Pencil, Phone, Plus, Search, Users, X } from 'lucide-react';
import { RelationshipGraph, contactRoles, relationshipLabels } from '@/components/relationship-graph';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { RelationshipHome, type RelationshipHomeData } from '@/components/relationship-home';
import { recentCompanyIds, relationshipHistoryKey, rememberCompany } from '@/lib/relationshipHistory';
export type DirectoryContext = {
    roles: string[]; scope: string; legalEntity: string; jurisdiction: string; registryNumber: string;
    sourceType: string; sourceRef: string; asOf: string; evidenceStatus: string; notes: string;
};
const blankContext = (role = 'unknown'): DirectoryContext => ({roles:[role], scope:'',legalEntity:'',jurisdiction:'',registryNumber:'',sourceType:'broker_knowledge',sourceRef:'',asOf:today(),evidenceStatus:'recorded',notes:''});
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
export type Contact = {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    company: string | null;
    isPrimary: boolean;
    directoryContext?: DirectoryContext | null;
};
export type Relationship = {
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
export type Finding = { id: string; payload: {contact: Contact}; status: string; createdAt: string };
export type Detail = {
    broker?: Broker;
    prospect?: {
        id: string;
        name: string;
        businessName: string | null;
        address: string | null;
    };
    contacts?: Contact[];
    relationships: Relationship[];
    findings?: Finding[];
    coverage?: Array<{role:string;gap:boolean;recordedContacts:string[]}>;
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
    const limits: Record<string,number> = {sourceUrl:2000,sourceRef:2000,linkedinUrl:2000,scope:500,legalEntity:300,jurisdiction:120,registryNumber:120,phone:80,email:320};
    return <div className="space-y-1.5"><Label htmlFor={'field-' + name}>{label}</Label><Input id={'field-' + name} name={name} value={value || ''} onChange={e => onChange(name, e.target.value)} onBlur={e => { if(type==='date') onChange(name,e.currentTarget.value) }} required={required} type={type} maxLength={limits[name] || 240}/></div>;
}
function EditDialog({ editor, detail, close, saved }: {
    editor: Editor;
    detail?: Detail;
    close: () => void;
    saved: (kind: string, id: string, archived: boolean) => void;
}) {
    const {user,isDemoMode}=useAuth();
    const [values, setValues] = useState(editor.values);
    const [search, setSearch] = useState('');
    const options = useQuery<Directory>({ queryKey: [base, isDemoMode?'demo-user':user?.id, 'choices', search], queryFn: () => request(base + '?search=' + encodeURIComponent(search)), enabled: editor.kind === 'relationship' && !editor.values.version });
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
                body = { name: input.name, title: input.title, company: input.company, email: input.email, phone: input.phone, directoryContext: input.directoryContext };
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
    const context = values.directoryContext as DirectoryContext | undefined;
    const contextChange = (key: string, value: string | string[]) => setValues(previous => ({...previous,directoryContext:{...previous.directoryContext,[key]:value}}));
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
        {editor.kind === 'contact' && context && <div className="space-y-4 border-t border-slate-200 pt-4">
          <fieldset><legend className="mb-2 text-sm font-medium">Company connections</legend><div className="grid grid-cols-2 gap-2">
            {[...contactRoles,{id:'unknown',label:'Role to confirm'}].map(role => <label key={role.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={context.roles.includes(role.id)} onChange={event => {
              const next = event.target.checked ? [...context.roles.filter(r => r !== 'unknown'),role.id] : context.roles.filter(r => r !== role.id);
              contextChange('roles',role.id === 'unknown' && event.target.checked ? ['unknown'] : next.length ? next : ['unknown']);
            }}/>{role.label}</label>)}
          </div></fieldset>
          <Field name="scope" label="Responsibility or decision-making scope" value={context.scope} onChange={contextChange}/>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="source-type">Source</Label><select id="source-type" className="h-10 w-full rounded-md border px-3 text-sm" value={context.sourceType} onChange={e => contextChange('sourceType',e.target.value)}>
            {Object.entries({broker_knowledge:'My knowledge',company_website:'Company website',corporate_search:'Corporate search',email:'Email',linkedin:'LinkedIn',other:'Other record'}).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select></div><Field name="asOf" label="Source date" value={context.asOf} type="date" required={context.sourceType==='corporate_search'} onChange={contextChange}/></div>
          <Field name="sourceRef" label="Source link or document reference" value={context.sourceRef} required={context.sourceType==='corporate_search'} onChange={contextChange}/>
          {(context.roles.includes('director') || context.sourceType === 'corporate_search') && <div className="space-y-3 rounded-md bg-slate-50 p-3">
            <Field name="legalEntity" label="Exact legal entity" value={context.legalEntity} required={context.sourceType==='corporate_search'} onChange={contextChange}/>
            <div className="grid gap-3 sm:grid-cols-2"><Field name="jurisdiction" label="Registry jurisdiction" value={context.jurisdiction} required={context.sourceType==='corporate_search'} onChange={contextChange}/><Field name="registryNumber" label="Registry number (if known)" value={context.registryNumber} onChange={contextChange}/></div>
            <p className="text-xs leading-5 text-slate-500">A directorship records a legal connection. Record any evidence of real estate authority separately in the scope above.</p>
          </div>}
          <div className="space-y-1.5"><Label htmlFor="evidence-status">Evidence</Label><select id="evidence-status" className="h-10 w-full rounded-md border px-3 text-sm" value={context.evidenceStatus} onChange={e => contextChange('evidenceStatus',e.target.value)}><option value="recorded">Recorded by me</option><option value="observed">Observed in a source</option><option value="inferred">Inferred, needs verification</option></select></div>
          <div className="space-y-1.5"><Label htmlFor="contact-notes">Notes</Label><Textarea id="contact-notes" value={context.notes} onChange={e => contextChange('notes',e.target.value)} maxLength={4000} rows={3}/></div>
        </div>}
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
  const {user,isDemoMode}=useAuth()
  const owner=isDemoMode?'demo-user':user?.id||''
  const [, navigate] = useLocation()
  const params = new URLSearchParams(useSearch())
  const selectedBroker = params.get('broker')
  const selectedCompany = params.get('company')
  const selectedId = selectedBroker || selectedCompany
  const [search,setSearch] = useState('')
  const [debounced,setDebounced] = useState('')
  const [searchOpen,setSearchOpen] = useState(false)
  const [history,setHistory] = useState<{owner:string;ids:string[]}>({owner:'',ids:[]})
  useEffect(()=>{
    let ids:string[]=[]
    try { if(owner) ids=recentCompanyIds(JSON.parse(localStorage.getItem(relationshipHistoryKey(owner))||'[]')) } catch {}
    setHistory({owner,ids})
  },[owner])
  const recentIds=history.owner===owner?history.ids:[]
  const [editor,setEditor] = useState<Editor|null>(null)
  const [inspection,setInspection] = useState<{kind:'contact'|'role'|'relationship'|'broker'|'research';value?:any}|null>(null)
  const [notice,setNotice] = useState('')
  const [trail,setTrail] = useState<Array<{type:'company'|'broker';id:string;name:string}>>([])
  const [updatesOpen,setUpdatesOpen] = useState(params.get('updates')==='1')
  const queryClient = useQueryClient()
  useEffect(() => { const timer=setTimeout(() => setDebounced(search),180); return () => clearTimeout(timer) },[search])
  useEffect(() => {setInspection(null);setNotice('')},[selectedId])
  const directory = useQuery<Directory>({queryKey:[base,owner,'search',debounced],queryFn:() => request(base+'?search='+encodeURIComponent(debounced)),enabled:!!owner&&searchOpen})
  const path = base+(selectedBroker?'/brokers/':'/companies/')+encodeURIComponent(selectedId||'')
  const detailQuery = useQuery<Detail>({queryKey:[base,owner,'detail',path],queryFn:() => request(path),enabled:!!owner&&Boolean(selectedId),refetchOnWindowFocus:true,refetchInterval:30000})
  const home=useQuery<RelationshipHomeData>({queryKey:[base,owner,'home',recentIds.join(',')],queryFn:()=>request(base+'/home?recent='+encodeURIComponent(recentIds.join(','))),enabled:!!owner&&!selectedId,refetchOnWindowFocus:true})
  const updates = useQuery<{changes:Array<{externalKey:string;createdAt:string;companyName:string|null;request:any;result:any;beforeRecord:any}>}>({
    queryKey:[base,owner,'changes'],queryFn:()=>request(base+'/changes'),enabled:!!owner&&updatesOpen,refetchOnWindowFocus:true,refetchInterval:updatesOpen?30000:false,
  })
  const detail=detailQuery.data
  useEffect(()=>{
    const id=detail?.prospect?.id
    if(!owner||!id||!selectedCompany) return
    setHistory(previous=>{
      const ids=rememberCompany(previous.owner===owner?previous.ids:[],id)
      try { localStorage.setItem(relationshipHistoryKey(owner),JSON.stringify(ids)) } catch {}
      return {owner,ids}
    })
  },[owner,detail?.prospect?.id,selectedCompany])
  const broker=detail?.broker
  const name=broker?.name || detail?.prospect?.businessName || detail?.contacts?.find(c=>c.company)?.company || detail?.prospect?.name || ''
  const choose=(type:'company'|'broker',id:string) => {
    if(selectedId && name && id!==selectedId) setTrail(items=>[...items,{type:selectedBroker?'broker' as const:'company' as const,id:selectedId,name}].slice(-4))
    setSearchOpen(false);setSearch('')
    navigate('/app/desk/relationships?'+type+'='+encodeURIComponent(id))
  }
  const sampleNotice='Fictional samples are read-only. Sign in to maintain your own company relationships.'
  const openBroker=(value?:Broker) => {if(isDemoMode){setNotice(sampleNotice);return};setInspection(null);setEditor({kind:'broker',values:value?{...value}:{...blankBroker,id:crypto.randomUUID()}})}
  const openContact=(contact?:Contact,role='unknown') => {
    if(isDemoMode){setNotice(sampleNotice);return}
    setInspection(null)
    setEditor({kind:'contact',values:contact?{...contact,directoryContext:contact.directoryContext||blankContext(role)}:{name:'',email:'',phone:'',company:name,title:'',directoryContext:blankContext(role)}})
  }
  const openLink=(relationship?:Relationship) => {
    if(isDemoMode){setNotice(sampleNotice);return}
    setInspection(null)
    setEditor({kind:'relationship',values:relationship?{...relationship}:{id:crypto.randomUUID(),brokerId:selectedBroker||'',prospectId:detail?.prospect?.id||'',status:'unverified',scope:'',notes:'',sourceUrl:'',learnedOn:today(),version:0,archived:false}})
  }
  const invalidate=async() => {
    await queryClient.invalidateQueries({queryKey:[base]})
    await queryClient.invalidateQueries({queryKey:['/api/calling']})
  }
  const saved=async(kind:string,id:string,archived:boolean) => {
    setEditor(null);await invalidate();setNotice('Saved to your private relationship map.')
    if(kind==='broker') archived?navigate('/app/desk/relationships'):choose('broker',id)
  }
  const review=useMutation({
    mutationFn:async({id,decision}:{id:string;decision:'accepted'|'rejected'}) => apiRequest('POST',base+'/findings/'+id+'/review',{decision}),
    onSuccess:async() => {await invalidate();setNotice('Finding reviewed. Your relationship map is up to date.')},
  })
  const role=contactRoles.find(r=>r.id===inspection?.value)
  const inspectedContact:Contact|undefined=inspection?.kind==='contact'?inspection.value:undefined
  const inspectedLink:Relationship|undefined=inspection?.kind==='relationship'?inspection.value:undefined
  const roleContacts=detail?.contacts?.filter(c=>inspection?.value==='unknown'?!c.directoryContext?.roles.some(r=>r!=='unknown'):c.directoryContext?.roles.includes(inspection?.value))||[]
  const findings=(detail?.findings||[]).filter(f=>inspection?.kind==='research'||f.payload.contact.directoryContext?.roles.includes(inspection?.value))
  const sourceBlock=(context?:DirectoryContext|null) => context && <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 text-sm">
    <div className="flex flex-wrap gap-2">{context.roles.map(value=><span key={value} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{contactRoles.find(r=>r.id===value)?.label || 'Role to confirm'}</span>)}<span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{context.evidenceStatus==='inferred'?'Inferred, verify':context.evidenceStatus==='observed'?'Source observation':'Broker recorded'}</span></div>
    {context.scope&&<p className="leading-6 text-slate-700">{context.scope}</p>}
    {context.legalEntity&&<div className="rounded bg-slate-50 p-3"><p className="font-medium">{context.legalEntity}</p><p className="mt-1 text-xs text-slate-500">{[context.jurisdiction,context.registryNumber].filter(Boolean).join(' · ')}</p><p className="mt-2 text-xs leading-5 text-slate-500">Directorship alone does not establish authority over property decisions.</p></div>}
    {context.sourceRef&&<p className="break-words text-xs text-slate-600">{/^https:\/\//i.test(context.sourceRef)?<a href={context.sourceRef} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">Open source ↗</a>:context.sourceRef}{context.asOf?' · '+context.asOf:''}</p>}
    {!context.sourceRef&&<p className="text-xs text-slate-500">Source reference not yet recorded{context.asOf?' · '+context.asOf:''}</p>}
    {context.notes&&<p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{context.notes}</p>}
  </div>
  return <div className="min-h-full bg-[#f5f7fa]">
    <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center gap-4"><Link href="/app/desk" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-700"><ArrowLeft className="h-3.5 w-3.5"/>Daily Desk</Link>{selectedId&&<button className="text-xs font-medium text-blue-700 hover:underline" onClick={()=>{setTrail([]);setSearch('');setSearchOpen(false);navigate('/app/desk/relationships')}}>All companies</button>}</div>
      {isDemoMode&&<p role="note" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Demo: fictional samples only. These companies and people are not real account data, and changes cannot be saved.</p>}
      <PageHeader className="gap-2 pb-3 sm:gap-4 sm:pb-5" label="Your network" title="Company relationships" description="Find a company. Follow the people, brokers and corporate connections around it." icon={Network} actions={<Button size="sm" variant="outline" onClick={()=>openBroker()}><Plus className="h-4 w-4"/>Add broker</Button>}/>
      <div className="my-3 flex flex-wrap items-start gap-2 sm:my-5 sm:gap-3">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-0">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400"/>
          <Input className="h-10 bg-white pl-10 pr-10" aria-label="Search companies, contacts or brokers" placeholder="Company, contact or broker…" value={search} onFocus={()=>setSearchOpen(true)} onKeyDown={e=>{if(e.key==='Escape')setSearchOpen(false)}} onChange={e=>{setSearch(e.target.value);setSearchOpen(true)}}/>
          {searchOpen&&<button aria-label="Close search results" className="absolute right-3 top-3 text-slate-400" onClick={()=>setSearchOpen(false)}><X size={16}/></button>}
          {searchOpen&&<div className="absolute left-0 right-0 top-12 z-20 max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {directory.isLoading&&<p className="p-3 text-sm text-slate-500">Searching your directory…</p>}
            {directory.isError&&<div role="alert" className="p-3 text-sm text-red-700">Could not load results. <button onClick={()=>directory.refetch()}>Retry</button></div>}
            {[{label:'Companies',rows:directory.data?.companies,type:'company' as const},{label:'Brokers',rows:directory.data?.brokers,type:'broker' as const}].map(group=>!!group.rows?.length&&<div key={group.type}>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
              {group.rows.map(row=><button key={row.id} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-blue-50" onClick={()=>choose(group.type,row.id)}>
                {group.type==='company'?<Building2 className="h-4 w-4 shrink-0 text-slate-400"/>:<Users className="h-4 w-4 shrink-0 text-slate-400"/>}
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{row.name}</span><span className="mt-0.5 block truncate text-xs text-slate-400">{'office' in row?row.office||row.firm:row.address||row.recordName}</span></span><ArrowRight size={14} className="text-slate-300"/>
              </button>)}
            </div>)}
            {!directory.isLoading&&!directory.isError&&!directory.data?.companies.length&&!directory.data?.brokers.length&&<p className="p-3 text-sm text-slate-500">No matching company or broker.</p>}
            {(directory.data?.moreCompanies||directory.data?.moreBrokers)&&<p className="p-3 text-xs text-slate-500">Search more specifically to narrow the first 100 results.</p>}
          </div>}
        </div>
        {detail&&!broker&&<><Button className="h-10" variant="outline" onClick={()=>openContact()}><Plus size={15}/>Add contact</Button><Button className="h-10" variant="outline" onClick={()=>setInspection({kind:'research'})}>Research gaps</Button>{!!detail.findings?.length&&<Button className="h-10 text-violet-700" variant="outline" onClick={()=>setInspection({kind:'research'})}>Needs review · {detail.findings.length}</Button>}</>}
        <Button className="h-10" variant="outline" onClick={()=>setUpdatesOpen(value=>!value)} aria-expanded={updatesOpen}>Recent updates</Button>
      </div>
      {trail.length>0&&<nav aria-label="Relationship trail" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        {trail.map((item,index)=><span className="inline-flex items-center" key={index}><button className="min-h-10 px-2 text-blue-700 hover:underline" onClick={()=>{setTrail(items=>items.slice(0,index));setSearchOpen(false);navigate('/app/desk/relationships?'+item.type+'='+encodeURIComponent(item.id))}}>{item.name}</button><ArrowRight size={12}/></span>)}<span className="px-2 font-medium text-slate-700">{name}</span>
      </nav>}
      {updatesOpen&&<section aria-label="Recent relationship updates" className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold">Recent relationship updates</h2><p className="mt-1 text-xs text-slate-500">Saved by Codex with source evidence. Historical connections keep their original scope.</p>
        {updates.isLoading&&<p className="mt-3 text-sm text-slate-500">Loading updates…</p>}
        {updates.isError&&<p role="alert" className="mt-3 text-sm text-red-700">Updates could not be loaded. <button onClick={()=>updates.refetch()}>Retry</button></p>}
        {updates.data?.changes.length===0&&<p className="mt-3 text-sm text-slate-500">No relationship changes recorded yet.</p>}
        <div className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto">{updates.data?.changes.slice(0,20).map(change=>{
          const r=change.request,companyId=r.prospectId||r.relationship?.prospectId
          const label=r.contact?.name||r.broker?.name||change.companyName||'Broker connection'
          return <div className="py-3" key={change.externalKey}><button className="min-h-8 text-left text-sm font-medium text-blue-700 hover:underline" onClick={()=>choose(companyId?'company':'broker',companyId||change.result.id)}>{label}</button>
            <p className="text-xs text-slate-600">{r.kind==='contact'?'Contact':r.kind==='broker'?'Broker':'Account connection'} {change.beforeRecord?'updated':'added'}{r.relationship?' · '+statuses[r.relationship.status]:''}{r.contact&&change.companyName?' · '+change.companyName:''}</p>
            <p className="mt-1 text-xs text-slate-500">Saved {new Date(change.createdAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · Source {r.evidence.asOf}</p>
            <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer py-1">Source &amp; scope</summary><p className="mt-1 whitespace-pre-wrap leading-5">{r.evidence.fact}</p><p className="mt-1 break-words leading-5">{r.evidence.reference}</p></details>
          </div>
        })}</div>
      </section>}
      {notice&&<p role="status" className="mb-3 text-xs text-emerald-700">{notice}</p>}
      {!selectedId&&<RelationshipHome data={home.data} loading={home.isLoading} error={home.isError} retry={()=>home.refetch()} open={id=>choose('company',id)} search={()=>setSearchOpen(true)}/>}
      {detailQuery.isLoading&&selectedId&&<p className="py-20 text-center text-sm text-slate-500">Opening relationship map…</p>}
      {detailQuery.isError&&<div role="alert" className="rounded border border-red-200 bg-white p-5 text-sm text-red-700">This record could not be opened. <Button variant="ghost" onClick={()=>detailQuery.refetch()}>Retry</Button></div>}
      {detail&&<RelationshipGraph detail={detail} name={name} choose={choose} addContact={role=>openContact(undefined,role)} addLink={()=>openLink()} inspectContact={contact=>setInspection({kind:'contact',value:contact})} inspectRelationship={link=>setInspection({kind:'relationship',value:link})} inspectRole={role=>setInspection({kind:'role',value:role})} inspectBroker={()=>setInspection({kind:'broker'})}/>}
    </div>
    {editor&&<EditDialog key={editor.kind+(editor.values.id||'new')} editor={editor} detail={detail} close={()=>setEditor(null)} saved={saved}/>}
    {inspection&&<Dialog open onOpenChange={open=>{if(!open)setInspection(null)}}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{inspectedContact?.name || (inspectedContact?'Company contact details':null) || (inspectedLink?'Account connection':null) || (inspection.kind==='broker'?broker?.name:null) || (inspection.kind==='research'?'Research gaps & findings':role?.label || 'Role to confirm')}</DialogTitle>
          <DialogDescription>{inspection.kind==='broker'?broker?.firm:name}</DialogDescription></DialogHeader>
        {inspectedContact&&<div><p className="text-sm text-slate-500">{inspectedContact.title||'Title not yet recorded'}</p><ContactLinks name={inspectedContact.name||''} company={name} email={inspectedContact.email} phone={inspectedContact.phone}/>{sourceBlock(inspectedContact.directoryContext)}<Button className="mt-5" size="sm" variant="outline" onClick={()=>openContact(inspectedContact)}><Pencil size={13}/>Edit contact & connections</Button></div>}
        {inspectedLink&&<div className="space-y-3"><p className="text-sm font-medium">{inspectedLink.brokerName} → {inspectedLink.companyName}</p><p className="text-xs text-slate-500">{relationshipLabels[inspectedLink.status]} · Learned {inspectedLink.learnedOn}</p><p className="text-sm">{inspectedLink.scope||'Scope to be confirmed'}</p><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{inspectedLink.notes}</p>{inspectedLink.sourceUrl&&<a href={inspectedLink.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-700">Open source ↗</a>}<Button size="sm" variant="outline" onClick={()=>openLink(inspectedLink)}><Pencil size={13}/>Edit connection</Button></div>}
        {inspection.kind==='broker'&&broker&&<div><p className="text-sm text-slate-500">{broker.office}</p><ContactLinks company={broker.firm} {...broker}/>{broker.notes&&<p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{broker.notes}</p>}{broker.sourceUrl&&<a href={broker.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block text-xs text-blue-700">Contact source ↗</a>}<Button className="mt-5" variant="outline" size="sm" onClick={()=>openBroker(broker)}><Pencil size={13}/>Edit broker</Button></div>}
        {inspection.kind==='role'&&<div>
          {roleContacts.map(contact=><button key={contact.id} className="mb-2 flex w-full items-center justify-between rounded-md border border-slate-200 p-3 text-left text-sm" onClick={()=>setInspection({kind:'contact',value:contact})}><span>{contact.name||'Company main line'}<small className="mt-1 block text-xs text-slate-500">{contact.title||contact.email||contact.phone||'Title to confirm'}</small></span><ArrowRight size={14}/></button>)}
          {!roleContacts.length&&<p className="text-sm leading-6 text-slate-500">No contact identified for this branch yet. Add a person and the source supporting their connection to this company.</p>}
          <Button size="sm" variant="outline" className="mt-4" onClick={()=>openContact(undefined,inspection.value)}><Plus size={13}/>Add {role?.label.toLowerCase()||'company'} contact</Button>
        </div>}
        {inspection.kind==='research'&&<div><p className="text-sm leading-6 text-slate-500">These gaps are also included in the agent's company brief, alongside the saved contacts, broker connections and sources.</p><div className="mt-4 divide-y divide-slate-100">{detail?.coverage?.map(item=><button key={item.role} className="flex w-full justify-between py-3 text-left text-sm" onClick={()=>setInspection({kind:'role',value:item.role})}><span>{contactRoles.find(r=>r.id===item.role)?.label}</span><span className="text-xs text-slate-500">{item.gap?'Needs research':item.recordedContacts.length+' recorded'}</span></button>)}</div></div>}
        {(inspection.kind==='role'||inspection.kind==='research')&&findings.length>0&&<div className="mt-4 border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold">Agent findings to review</h3>{findings.map(finding=><section className="mt-3 rounded-md border border-dashed border-violet-200 p-3" key={finding.id}><h4 className="text-sm font-medium">{finding.payload.contact.name}</h4><p className="mt-1 text-xs text-slate-500">{finding.payload.contact.title}</p><ContactLinks name={finding.payload.contact.name||''} company={name} email={finding.payload.contact.email} phone={finding.payload.contact.phone}/>{sourceBlock(finding.payload.contact.directoryContext)}<div className="mt-4 flex gap-2"><Button size="sm" disabled={review.isPending} onClick={()=>review.mutate({id:finding.id,decision:'accepted'})}>Save to company</Button><Button variant="outline" size="sm" disabled={review.isPending} onClick={()=>review.mutate({id:finding.id,decision:'rejected'})}>Dismiss</Button></div></section>)}</div>}
        {review.isError&&<p role="alert" className="text-sm text-red-700">{review.error.message}</p>}
      </DialogContent>
    </Dialog>}
  </div>
}
