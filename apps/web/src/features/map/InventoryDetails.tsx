import { INVENTORY_CLASS_META, getPropertyInventory, registrationHistory } from '@level-cre/shared'
export function InventoryDetails({prospect,onReviewContact}:{prospect:{aiMetadata?:unknown;lastContactDate?:string|null;status?:string};onReviewContact?:()=>void}) {
 const data=getPropertyInventory(prospect)
 if(!data)return null
 const history=registrationHistory(data.titleRecords.map(title=>title.lastSaleDate))
 const lastContact=prospect.lastContactDate?new Date(prospect.lastContactDate):null
 const validContact=lastContact&&Number.isFinite(lastContact.getTime())
 const recentContact=validContact&&Date.now()-lastContact.getTime()<90*86400000
 const meta=INVENTORY_CLASS_META[data.classification]
 const confidence=data.confidence==='med'?'Medium':data.confidence==='unrated'?'Unrated':data.confidence==='high'?'High':'Low'
 const fields=[['Address',data.address],['Occupant',data.occupant],['Business park',data.businessPark],['Zoning',data.zoning],['Assessment',data.assessment===null?'Not recorded':new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(data.assessment)],['Year built',data.yearBuiltText||'Not recorded'],['Ownership signal',data.ownerOccGuess],['Covenant signal',data.covenantStrength]]
 return <section className="space-y-3" aria-label="Property inventory details">
  <div className={`rounded-lg border p-3 ${history?.longHeld?'border-amber-200 bg-amber-50':'border-slate-200 bg-slate-50'}`}>
   <h3 className="text-xs font-semibold text-slate-700">{history&&history.titleCount>1?'Latest recorded registration':'Last recorded registration'}</h3>
   <p className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{history?new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(history.latest+'T00:00:00Z')):'Date needs review'}</p>
   {history&&<p className="mt-1 text-sm font-medium">{history.years===0?'Less than a year ago':`${history.years} years ago`}{history.longHeld?' · Long-held signal':''}</p>}
   <p className="mt-2 text-[11px] leading-4 text-slate-600">Title registration from the source, not a verified sale or proof of unchanged ownership.{history&&history.titleCount>1?` Newest of ${history.titleCount} title records shown.`:''}</p>
   <div className="mt-3 border-t border-slate-200 pt-2 text-xs leading-5">
    <p>{validContact?`Last recorded contact: ${lastContact.toLocaleDateString('en-CA')}`:'No last-contact date recorded.'}</p>
    {history?.longHeld&&!recentContact&&prospect.status!=='no_go'&&<p className="mt-1 font-medium text-amber-950">Consider an ownership check-in. Review activity and the current owner before calling.</p>}
    {prospect.status==='no_go'&&<p className="mt-1">No Go — review relationship history before outreach.</p>}
    {onReviewContact&&<button type="button" onClick={onReviewContact} className="mt-2 min-h-10 rounded-md border border-slate-300 bg-white px-3 font-semibold hover:bg-slate-50">Review contact</button>}
   </div>
  </div>
  {data.occupant&&<div className="text-xs"><p className="font-semibold text-slate-500">Recorded occupant</p><p className="mt-1 break-words">{data.occupant}</p></div>}
  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-semibold">Property research and title evidence</summary>
  <p className="mt-3 mb-2 text-[11px] text-slate-500">Original imported classification and research:</p>
  <div className="flex flex-wrap items-center gap-2"><span className="rounded px-2 py-1 text-xs font-semibold text-white" style={{backgroundColor:meta.color}}>{meta.label}</span><span className={`text-xs font-medium ${data.confidence==='low'?'text-amber-800':'text-slate-600'}`}>{confidence} confidence</span></div>
  <p className="mt-2 text-[11px] leading-4 text-slate-500">Maps classification with selective CoStar research. Occupancy and covenant are research signals.</p>
  {data.subFilters.includes('costar_partial')?<p className="mt-2 text-xs font-medium text-amber-800">CoStar partial: search-grid evidence only; tenancy was not confirmed on a detail page.</p>:null}
  <dl className="mt-3 space-y-2 text-xs">{fields.map(([label,value])=><div key={label}><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5 break-words text-slate-800">{value||'Not recorded'}</dd></div>)}</dl>
  <div className="mt-3 border-t border-slate-200 pt-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Titles and registration dates</p>{data.titleRecords.map(title=><dl key={title.titleNumber} className="mt-2 space-y-1 text-xs"><div><dt className="inline text-slate-500">Title # </dt><dd className="inline break-all">{title.titleNumber}</dd></div><div><dt className="inline text-slate-500">Legal </dt><dd className="inline break-words">{title.legal}</dd></div><div><dt className="inline text-slate-500">Last registration </dt><dd className="inline">{title.lastSaleDate}</dd></div></dl>)}<p className="mt-2 text-[11px] leading-4 text-slate-500">The source LastSaleDate is an Alberta title registration date, not a verified sale.</p></div>
  <details className="mt-3 border-t border-slate-200 pt-2 text-xs"><summary className="cursor-pointer font-semibold text-blue-700">Research notes and tags</summary><p className="mt-2 break-words text-slate-600">{data.subFilters.length?data.subFilters.join(', '):'No additional tags'}</p><p className="mt-2 whitespace-pre-wrap break-words leading-5 text-slate-700">{data.notes}</p>
    {data.costar.buildingSfText?<p className="mt-2">CoStar building area: {data.costar.buildingSfText}</p>:null}
    {data.costar.propertyId?<p className="mt-2">CoStar property ID: {data.costar.propertyId}</p>:null}
    {data.costar.owner?<p className="mt-2 break-words">CoStar owner: {data.costar.owner}</p>:null}
    {data.costar.contacts?<p className="mt-2 whitespace-pre-wrap break-words">CoStar contacts: {data.costar.contacts}</p>:null}
    <p className="mt-3 text-[11px] text-slate-500">Source: {data.source.file}, {data.source.sheet}, row{data.titleRecords.length===1?'':'s'} {data.titleRecords.map(title=>title.sourceRow).join(', ')}. Reviewed {data.source.reviewedOn}.</p>
  </details>
 </details></section>
}
