import { ArrowRight, Building2, Clock3, GitBranch, Network, UserRound } from 'lucide-react'
import { relationshipLabels } from './relationship-graph'
import { Button } from './ui/button'
import './relationship-home.css'

export type CompanyPreview={id:string;name:string;address:string|null;activityAt:string|null;activityType:string|null;
  contactCount:number;brokerCount:number;contacts:Array<{name:string;title:string|null}>;
  brokers:Array<{id:string;name:string;status:string;scope:string}>}
export type RelationshipHomeData={recent:CompanyPreview[];engaged:CompanyPreview[];connected:CompanyPreview[];suggested:CompanyPreview[]}
const activityLabels:Record<string,string>={email_sent:'Email sent',email_received:'Email received',call_attempted:'Call recorded',meeting:'Meeting'}
const counts=(company:CompanyPreview)=>`${company.contactCount} ${company.contactCount===1?'contact':'contacts'} · ${company.brokerCount} ${company.brokerCount===1?'broker link':'broker links'}`
function activityLabel(company:CompanyPreview) {
  return company.activityAt ? `${activityLabels[company.activityType||'']||'Activity'} · ${new Date(company.activityAt).toLocaleDateString([],{month:'short',day:'numeric'})}` : 'Saved in your network'
}

function CompanyCard({company,open}:{company:CompanyPreview;open:(id:string)=>void}) {
  const broker=company.brokers[0],contact=company.contacts[0]
  return <button className="network-preview" onClick={()=>open(company.id)} aria-label={`Open ${company.name} relationship map`}>
    <span className="preview-context"><Clock3 size={12}/>{activityLabel(company)}</span>
    <span className="preview-company"><Building2 size={16}/><span><strong>{company.name}</strong><small>{company.address||'Company account'}</small></span></span>
    <span className="preview-fork" aria-hidden="true"><i/><i/></span>
    <span className="preview-branches">
      <span className={'preview-person '+(!broker?'preview-missing':'')}><span className="preview-kind"><GitBranch size={12}/>Broker connection</span><strong>{broker?.name||'No broker linked yet'}</strong><small>{broker?relationshipLabels[broker.status]:'Builds as you learn who works with who'}</small></span>
      <span className={'preview-person '+(!contact?'preview-missing':'')}><span className="preview-kind"><UserRound size={12}/>Company contact</span><strong>{contact?.name||'No named contact yet'}</strong><small>{contact?.title|| (contact?'Role to confirm':'Add a person when you find them')}</small></span>
    </span>
    <span className="preview-footer"><span>{counts(company)}</span><span>Open map <ArrowRight size={13}/></span></span>
  </button>
}

export function RelationshipHome({data,loading,error,retry,open,search}:{data?:RelationshipHomeData;loading:boolean;error:boolean;retry:()=>void;open:(id:string)=>void;search:()=>void}) {
  if(loading) return <div aria-label="Loading company previews" aria-busy="true" className="network-preview-grid">{[1,2,3].map(i=><div key={i} className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white"/>)}</div>
  if(error) return <div role="alert" className="rounded-lg border border-slate-200 bg-white p-6 text-sm">Company previews could not be loaded. <Button variant="outline" size="sm" className="ml-2" onClick={retry}>Retry</Button></div>
  if(!data||![...data.recent,...data.engaged,...data.connected,...data.suggested].length) return <div className="rounded-lg border border-slate-200 bg-white px-6 py-14 text-center"><Network className="mx-auto h-8 w-8 text-blue-300"/><h2 className="mt-4 text-lg font-semibold">Your company network starts here</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Open an existing company to see its people and broker connections. Companies you work with will appear here.</p><Button variant="outline" className="mt-4" onClick={search}>Find a company</Button></div>
  return <div className="space-y-7">
    {!!data.recent.length&&<section aria-label="Recently opened companies"><div className="network-section-title"><h2>Pick up where you left off</h2><span>Recently opened on this browser</span></div><div className="recent-company-list">{data.recent.map(company=><button key={company.id} onClick={()=>open(company.id)} className="recent-company"><Building2 size={16}/><span><strong>{company.name}</strong><small>{counts(company)}</small></span><ArrowRight size={14}/></button>)}</div></section>}
    {[
      {id:'engaged',title:'In your recent conversations',hint:'Confirmed emails, calls and meetings · past 90 days',companies:data.engaged},
      {id:'connected',title:'Explore your connections',hint:'People and broker links already saved in your network',companies:data.connected},
      {id:'suggested',title:'Start with a company you know',hint:'Your existing company records',companies:data.suggested},
    ].filter(group=>group.companies.length).map(group=><section key={group.id} aria-label={group.title}><div className="network-section-title"><h2>{group.title}</h2><span>{group.hint}</span></div><div className="network-preview-grid">{group.companies.map(company=><CompanyCard key={company.id} company={company} open={open}/>)}</div></section>)}
  </div>
}
