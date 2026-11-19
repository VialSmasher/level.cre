import assert from 'node:assert/strict'
import test from 'node:test'
import { recentCompanyIds, relationshipHistoryKey, rememberCompany } from './relationshipHistory'

test('recent companies are bounded identifiers scoped to the authenticated owner',()=>{
  assert.notEqual(relationshipHistoryKey('owner'),relationshipHistoryKey('another-owner'))
  for(const value of [null,{},'company',4]) assert.deepEqual(recentCompanyIds(value),[])
  assert.deepEqual(recentCompanyIds(['a','a',null,{id:'secret'},'../../other','b']),['a','b'])
  assert.deepEqual(rememberCompany(['a','b','c','d','e','f'],'c'),['c','a','b','d','e','f'])
  assert.deepEqual(rememberCompany(['a','b','c','d','e','f'],'new'),['new','a','b','c','d','e'])
})
