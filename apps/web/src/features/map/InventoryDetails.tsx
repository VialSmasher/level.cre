import { INVENTORY_CLASS_META, getPropertyInventory } from '@level-cre/shared'
export function InventoryDetails({prospect}:{prospect:{aiMetadata?:unknown}}) {
 const data=getPropertyInventory(prospect)
 if(!data)return null
 const meta=INVENTORY_CLASS_META[data.classification]
 const confidence=data.confidence==='med'?'Medium':data.confidence==='unrated'?'Unrated':data.confidence==='high'?'High':'Low'
 const fields=[['Address',data.address],['Occupant',data.occupant],['Business park',data.businessPark],['Zoning',data.zoning],['Assessment',data.assessment===null?'Not recorded':new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(data.assessment)],['Year built',data.yearBuiltText||'Not recorded'],['Ownership signal',data.ownerOccGuess],['Covenant signal',data.covenantStrength]]
 return <section className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label="Property inventory details">
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
 </section>
}
