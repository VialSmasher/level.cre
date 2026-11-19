// Fictional, browser-only examples. Never copied from a broker account or persisted.
const broker={id:'sample-broker',name:'Jordan Example',firm:'Sample Brokerage',office:'Fictional example',email:'',phone:'',linkedinUrl:'',sourceUrl:'',notes:'Fictional sample only.',version:0,archived:false}
const companies=[
  {id:'sample-distribution',name:'Sample Distribution Co.',person:'Alex Sample',role:'operations',title:'Operations Director'},
  {id:'sample-manufacturing',name:'Sample Manufacturing Ltd.',person:'Taylor Example',role:'finance',title:'Finance Director'},
]
function contact(company:typeof companies[number]) {
  return {id:company.id+'-person',name:company.person,title:company.title,email:null,phone:null,company:company.name,isPrimary:false,
    directoryContext:{roles:[company.role],scope:'Fictional sample only.',legalEntity:'',jurisdiction:'',registryNumber:'',sourceType:'other',sourceRef:'Fictional demonstration',asOf:'2026-01-01',evidenceStatus:'recorded',notes:''}}
}
const links=companies.map(company=>({id:company.id+'-link',brokerId:broker.id,prospectId:company.id,brokerName:broker.name,companyName:company.name,recordName:company.name,firm:broker.firm,status:'unverified',scope:'Fictional account connection for demonstration only.',notes:'',sourceUrl:'',learnedOn:'2026-01-01',version:0,archived:false}))
export function relationshipDemoRead(path:string,params:URLSearchParams):unknown|undefined {
  const base='/api/desk/directory'
  if(path===base+'/home') {
    const previews=companies.map(company=>({id:company.id,name:company.name,address:'Fictional company',activityAt:null,activityType:null,contactCount:1,brokerCount:1,contacts:[contact(company)],brokers:[{...broker,status:'unverified',scope:'Fictional sample only.'}]}))
    const ids=(params.get('recent')||'').split(',')
    const recent=ids.flatMap(id=>previews.find(c=>c.id===id)||[]).filter((c,i,list)=>list.findIndex(item=>item.id===c.id)===i)
    return {recent,engaged:[],connected:previews.filter(c=>!recent.some(r=>r.id===c.id)),suggested:[]}
  }
  if(path===base) {
    const query=(params.get('search')||'').toLowerCase()
    return {companies:companies.filter(c=>(c.name+' '+c.person).toLowerCase().includes(query)).map(c=>({...c,recordName:c.name,address:'Fictional company',contactName:c.person})),brokers:broker.name.toLowerCase().includes(query)?[broker]:[],moreCompanies:false,moreBrokers:false}
  }
  if(path===base+'/changes')return {changes:[]}
  if(path===base+'/brokers/'+broker.id)return {broker,relationships:links}
  const company=companies.find(c=>path===base+'/companies/'+c.id)
  if(company)return {prospect:{id:company.id,name:company.name,businessName:company.name,address:'Fictional company'},contacts:[contact(company)],relationships:links.filter(link=>link.prospectId===company.id),findings:[],coverage:[]}
  return undefined
}
