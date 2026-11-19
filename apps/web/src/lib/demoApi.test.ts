import assert from 'node:assert/strict'
import test from 'node:test'
import { getDemoApiResult } from './demoApi'

test('demo answers locally with fictional relationships and cannot resolve private account IDs',t=>{
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://level-cre.vercel.app'}}})
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> 'true'}})
  t.after(()=>{for(const [key,value] of [['window',originalWindow],['localStorage',originalStorage]] as const){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key)}})
  const home:any=getDemoApiResult('GET','/api/desk/directory/home?recent=private-company')
  assert.equal(home.handled,true)
  assert.deepEqual(home.payload.recent,[])
  assert.deepEqual(home.payload.connected.map((c:any)=>c.name),['Sample Distribution Co.','Sample Manufacturing Ltd.'])
  assert.deepEqual(home.payload.connected.map((c:any)=>c.contacts[0].name),['Alex Sample','Taylor Example'])
  const company:any=getDemoApiResult('GET','/api/desk/directory/companies/sample-distribution')
  const broker:any=getDemoApiResult('GET','/api/desk/directory/brokers/'+company.payload.relationships[0].brokerId)
  assert.equal(broker.payload.broker.name,'Jordan Example')
  assert.equal(broker.payload.relationships.length,2)
  for(const path of ['/api/desk/directory/companies/private-company','/api/intel/directory/manifest','https://levelcre-production.up.railway.app/api/unknown']) {
    assert.equal(getDemoApiResult('GET',path)?.handled,true)
    assert.equal(getDemoApiResult('GET',path)?.status,404)
  }
  for(const method of ['POST','PUT','PATCH','DELETE']) {
    assert.equal(getDemoApiResult(method,'/api/desk/directory/brokers/private-broker',{userId:'private-owner'})?.status,403)
    assert.equal(getDemoApiResult(method,'/api/intel/directory/maintain',{userId:'private-owner'})?.status,403)
  }
  assert.equal(getDemoApiResult('POST','/api/desk/sync')?.status,403)
})

test('normal signed-in requests use the authenticated API instead of sample data',t=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}})
  t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage')})
  assert.equal(getDemoApiResult('GET','/api/desk/directory/home'),null)
  assert.equal(getDemoApiResult('POST','/api/intel/directory/maintain'),null)
})
