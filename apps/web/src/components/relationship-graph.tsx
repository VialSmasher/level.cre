import { Building2, ChevronRight, CircleHelp, Focus, GitBranch, Plus, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Contact, Detail, Relationship } from '@/pages/relationship-directory'
import './relationship-graph.css'

export const contactRoles = [
  { id: 'real_estate', label: 'Real estate', hint: 'Property strategy & transactions' },
  { id: 'operations', label: 'Operations', hint: 'Operating needs & expansion' },
  { id: 'facilities', label: 'Facilities', hint: 'Buildings & site requirements' },
  { id: 'finance', label: 'Finance / CFO', hint: 'Capital & financial approval' },
  { id: 'director', label: 'Directors', hint: 'Corporate records & legal entities' },
]
export const relationshipLabels: Record<string,string> = {
  unverified: 'To verify', active: 'Current relationship', historical: 'Past transaction', ended: 'Relationship ended',
}

type Props = {
  detail: Detail
  name: string
  choose: (type: 'company'|'broker', id: string) => void
  addContact: (role: string) => void
  addLink: () => void
  inspectContact: (contact: Contact) => void
  inspectRelationship: (relationship: Relationship) => void
  inspectRole: (role: string) => void
  inspectBroker: () => void
}

export function RelationshipGraph({detail, name, choose, addContact, addLink, inspectContact, inspectRelationship, inspectRole, inspectBroker}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [width,setWidth] = useState(1120)
  const [zoom,setZoom] = useState<number|null>(null)
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width))
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  },[])
  const zoomFactor = zoom ?? (width < 900 ? 1120/width : 1)
  const scale = Math.min(1,width / 1120) * zoomFactor
  const broker = detail.broker
  const relationships = detail.relationships
  const contacts = detail.contacts || []
  const isCompanyLine = (c:Contact) => !c.name || (!c.isPrimary && c.name === 'Company main line' && c.title === 'Company switchboard')
  const unknown = contacts.filter(c => !isCompanyLine(c) && !c.directoryContext?.roles?.some(role => role !== 'unknown'))
  const companyLine = contacts.find(c => isCompanyLine(c) && (c.phone || c.email))
  const branchTop = Math.max(80,395-(100+relationships.length*126)/2)
  const height = broker ? Math.max(720,relationships.length * 144 + 130) : Math.max(790,branchTop+100+relationships.length*126)
  const centreY = broker ? height / 2 : 395
  const rootX = broker ? 175 : 386
  useEffect(() => setZoom(null),[detail.prospect?.id,broker?.id])
  useEffect(() => {
    if (!host.current) return
    host.current.scrollLeft = Math.max(0,(rootX+135)*scale-width/2)
    host.current.scrollTop = Math.max(0,width<640 ? (centreY-65)*scale-24 : centreY*scale-host.current.clientHeight/2)
  },[rootX,centreY,scale,width,detail.prospect?.id,broker?.id])
  return <section className="relationship-map" aria-label={name + ' relationship map'}>
    <div className="map-caption"><span><GitBranch size={15}/>{broker ? 'Broker → connected accounts' : 'Company → people & relationships'}</span><span>{width<900?'Scroll to explore':'Private workspace'}</span></div>
    <div ref={host} className="map-viewport" tabIndex={0} aria-label="Scrollable relationship graph">
      <div style={{width:1120*scale,height:height*scale,margin:'0 auto'}}>
        <div className="map-world" style={{width:1120,height,transform:`scale(${scale})`}}>
          <svg className="map-wires" width="1120" height={height} aria-hidden="true">
            {!broker && <>
              {relationships.map((link,index) => <path key={link.id} d={`M386 395 C340 395 340 ${branchTop+106+index*126} 295 ${branchTop+106+index*126}`} className={link.status==='active'?'wire-current':link.status==='unverified'?'wire-unverified':'wire-broker'}/>)}
              {contactRoles.map((role,index) => <path key={role.id} className={contacts.some(c=>c.directoryContext?.roles.includes(role.id)&&c.directoryContext.evidenceStatus!=='inferred')?'':'wire-unknown'} d={`M656 395 C730 395 716 ${94+index*140} 790 ${94+index*140}`}/>) }
              {!!unknown.length && <path d="M521 460 C521 505 521 505 521 550" className="wire-unknown"/>}
              <circle cx="656" cy="395" r="4"/><circle cx="386" cy="395" r="4"/>
            </>}
            {broker && relationships.map((link,index) => {
              const y = 114 + index*144
              return <path key={link.id} className={link.status === 'active' ? 'wire-current' : link.status==='unverified'?'wire-unverified':'wire-broker'} d={`M445 ${centreY} C595 ${centreY} 585 ${y} 735 ${y}`}/>
            })}
          </svg>
          <div className="map-root" style={{left:rootX,top:centreY-65}}>
            <div className="map-root-label">{broker ? <UserRound size={15}/> : <Building2 size={15}/>}<span>{broker ? broker.firm : 'Company account'}</span></div>
            <h2>{name}</h2>
            <p>{broker ? broker.office : detail.prospect?.address || detail.prospect?.name}</p>
            {!broker && companyLine?.phone && <button className="map-company-phone" onClick={() => inspectContact(companyLine)}>Main line · {companyLine.phone}</button>}
            {broker && <div className="map-broker-contact">
              {broker.email && <a href={'mailto:' + broker.email}>{broker.email}</a>}
              {broker.phone && <a href={'tel:' + broker.phone.replace(/[^\d+]/g,'')}>{broker.phone}</a>}
              <button onClick={inspectBroker}>Contact details & LinkedIn <ChevronRight size={13}/></button>
            </div>}
          </div>
          {!broker && <>
            <div className="map-broker-branch" style={{left:35,top:branchTop}}>
              <div className="map-branch-heading"><span className="cw-mark">C&W</span><div><strong>Broker relationships</strong><small>Cushman & Wakefield and others</small></div></div>
              {!relationships.length && <p className="map-empty-note">No broker connection recorded yet.</p>}
              <div className="map-broker-list">{relationships.map(link => <div className="map-broker-node" key={link.id}>
                <button className="map-person" onClick={() => choose('broker',link.brokerId)}><span><strong>{link.brokerName}</strong><small>{relationshipLabels[link.status]}</small></span><ChevronRight size={15}/></button>
                <p className="map-link-scope" title={link.scope}>Scope: {link.scope||'To verify'}</p>
                <button className="map-evidence-link" onClick={() => inspectRelationship(link)}>Noted {link.learnedOn} · Evidence</button>
              </div>)}</div>
              <button className="map-add" onClick={addLink}><Plus size={13}/>Link a broker</button>
            </div>
            {contactRoles.map((role,index) => {
              const people = contacts.filter(contact => contact.directoryContext?.roles?.includes(role.id))
              const findings = detail.findings?.filter(f => f.payload.contact.directoryContext?.roles.includes(role.id)) || []
              return <section key={role.id} className={'map-role ' + (people.length ? 'has-contacts' : '')} style={{left:790,top:40+index*140}} aria-label={role.label + ' branch'}>
                <div className="map-role-heading"><button onClick={() => inspectRole(role.id)}>{role.label}<span>{people.length || '—'}</span></button><button aria-label={'Add ' + role.label + ' contact'} onClick={() => addContact(role.id)}><Plus size={15}/></button></div>
                {people.slice(0,2).map(contact => <button key={contact.id} className="map-person compact" onClick={() => inspectContact(contact)}><span>{contact.name || 'Contact details'}{contact.directoryContext?.evidenceStatus === 'inferred' && <small>Role inferred</small>}</span><ChevronRight size={13}/></button>)}
                {!people.length && <button className="map-empty" onClick={() => addContact(role.id)}><span>No contact identified</span><small>{role.hint}</small></button>}
                {(people.length>2 || findings.length>0) && <button className={'map-more ' + (findings.length ? 'has-findings' : '')} onClick={() => inspectRole(role.id)}>{people.length>2 ? `View all ${people.length} contacts` : ''}{findings.length ? ` ${findings.length} finding${findings.length===1?'':'s'} to review` : ''}</button>}
              </section>
            })}
            {!!unknown.length && <section className="map-unclassified" style={{left:386,top:550}}><h3><CircleHelp size={14}/>Role to confirm</h3>
              {unknown.slice(0,3).map(contact => <button key={contact.id} className="map-person compact" onClick={() => inspectContact(contact)}><span>{contact.name || 'Company main line'}<small>{contact.name ? contact.title || 'Saved contact' : contact.phone || contact.email}</small></span><ChevronRight size={13}/></button>)}
              <button className="map-evidence-link" onClick={() => inspectRole('unknown')}>View saved contacts{unknown.length>3 ? ` (${unknown.length})` : ''}</button>
            </section>}
            <div className="map-director-note">A director link records a corporate connection.<br/>Real estate authority needs its own evidence.</div>
          </>}
          {broker && <>
            <div className="map-account-heading" style={{left:735,top:19}}>CONNECTED ACCOUNTS <span>{relationships.length}</span></div>
            {relationships.map((link,index) => <section className="map-account" key={link.id} style={{left:735,top:60+index*144}}>
              <button className="map-person" onClick={() => choose('company',link.prospectId)}><span><strong>{link.companyName}</strong><small>{relationshipLabels[link.status]}</small></span><ChevronRight size={16}/></button>
              <p title={link.scope}>Scope: {link.scope || 'To verify'}</p><button className="map-evidence-link" onClick={() => inspectRelationship(link)}>Noted {link.learnedOn} · Evidence</button>
            </section>)}
            <button className="map-link-account" style={{left:735,top:72+relationships.length*144}} onClick={addLink}><Plus size={14}/>Link another account</button>
            <p className="map-broker-legend">Follow an account to its people and decision-making roles.</p>
          </>}
        </div>
      </div>
    </div>
    <div className="map-footer"><div className="map-key"><span><i/>Recorded connection</span><span><i className="dashed"/>Historical / ended</span><span><i className="unverified"/>To verify / missing</span></div><div className="map-controls"><button aria-label="Zoom out" disabled={zoomFactor<=.8} onClick={() => setZoom(Math.max(.8,zoomFactor-.2))}>−</button><button aria-label="Fit graph" onClick={() => setZoom(1)}><Focus size={14}/></button><button aria-label="Zoom in" disabled={zoomFactor>=4} onClick={() => setZoom(Math.min(4,zoomFactor+.2))}>+</button></div></div>
  </section>
}
