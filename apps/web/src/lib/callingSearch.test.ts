import assert from 'node:assert/strict'
import test from 'node:test'
import { callingSearchQuery, resolveCallingSearchContact, searchedCallingCandidate, type CallingSearchRow } from './callingSearch'
import type { CallingContact, CallingWorkspace } from './mobileCalling'

const greg: CallingContact = { id: 'greg', prospectId: 'sokill', isPrimary: false, name: 'Greg Mason', company: 'Sokill Transport', email: 'greg@example.test', phone: null, title: null, additionalPhones: [], archivedAt: null }
const primary: CallingContact = { ...greg, id: 'primary', isPrimary: true, name: 'Other Person', email: 'other@example.test', phone: '780-555-0100' }
const workspace: CallingWorkspace = { prospect: { id: 'sokill', name: 'Sokill Transport', businessName: null, address: null, status: 'prospect', followUpDueDate: null, lastContactDate: null, notes: '', buildingSf: null, lotSizeAcres: null, aiMetadata: null, websiteUrl: null }, contacts: [primary,greg], primaryContactId: primary.id, activity: [], unattributedActivityCount: 0 }
const row: CallingSearchRow = { prospect: workspace.prospect, contact: greg }

test('search resolves the exact alternate without borrowing a primary number', () => {
  const selected = resolveCallingSearchContact(row,workspace)!
  assert.equal(selected.id,'greg'); assert.equal(selected.phone,null)
  assert.equal(searchedCallingCandidate(workspace,selected).contact.phone,'')
  assert.equal(resolveCallingSearchContact({...row,prospect:{...row.prospect,id:'foreign'}},workspace),null)
})

test('missing, archived and rotated search identities cannot switch to primary', () => {
  assert.equal(resolveCallingSearchContact(row,{...workspace,contacts:[primary]}),null)
  for (const status of ['no_go', 'archived']) assert.equal(resolveCallingSearchContact(row,{...workspace,prospect:{...workspace.prospect,status}}),null)
  assert.equal(resolveCallingSearchContact(row,{...workspace,contacts:[primary,{...greg,archivedAt:'2026-10-08'}]}),null)
  assert.equal(resolveCallingSearchContact({...row,contact:{...primary,id:null}}, {...workspace,contacts:[{...primary,name:'Replacement'}]}),null)
})

test('unanchored primary resolves only the same canonical identity after fresh hydration', () => {
  const search = {...row,contact:{...primary,id:null,name:' OTHER   PERSON ',email:'OTHER@EXAMPLE.TEST'}}
  assert.equal(resolveCallingSearchContact(search,workspace)?.id,primary.id)
  const unnamed = {...primary,name:null,email:null,phone:'(780) 555-0100'}
  const same = {...workspace,contacts:[{...unnamed,phone:'+1 780-555-0100'}]}
  assert.equal(resolveCallingSearchContact({...row,contact:{...unnamed,id:null}},same),null)
  assert.equal(resolveCallingSearchContact({...row,contact:{...unnamed,id:null}}, {...workspace,contacts:[{...unnamed,phone:'780.555.0100'}]})?.id,primary.id)
  assert.equal(resolveCallingSearchContact({...row,contact:{...greg,id:null}},workspace),null)
})

test('search is normalized and prepared records retain their company and saved history', () => {
  assert.equal(callingSearchQuery('  Greg \n Sokill   '),'Greg Sokill')
  assert.equal(callingSearchQuery('x'.repeat(150)).length,120)
  const candidate = searchedCallingCandidate(workspace,{...greg,company:'Separate employer'})
  assert.equal(candidate.prospect.id,'sokill'); assert.equal(candidate.contact.name,'Greg Mason')
  assert.equal(candidate.contact.company,'Sokill Transport')
  assert.deepEqual(candidate.reasons,['Selected from search']); assert.equal(candidate.recentActivity,workspace.activity)
})
