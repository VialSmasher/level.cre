import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Tabs } from '@/components/ui/tabs'
import { AssetProfileTabs } from './AssetProfileTabs'
import { PropertyClassificationControl } from './PropertyClassificationControl'

test('unknown assets retain the same named tabs and stable classification targets', () => {
  const html = renderToStaticMarkup(<TooltipProvider><Tabs value="contact"><AssetProfileTabs /><PropertyClassificationControl value="unknown" sourceLabel="Not classified" onChange={() => {}} /></Tabs></TooltipProvider>)
  for (const tab of ['property','contact','activity']) assert.match(html, new RegExp(`data-testid="asset-tab-${tab}"`))
  for (const type of ['multi_tenant','single_tenant','developed_land','office','unknown']) assert.match(html, new RegExp(`data-testid="asset-type-${type}"`))
  assert.match(html, /data-testid="asset-type-label"[^>]*>Unclassified \/ other</)
  assert.match(html, /aria-label="Set property type: Single-tenant"/)
  assert.match(html, /aria-pressed="true" data-testid="asset-type-unknown"/)
})

test('pending classification exposes machine-readable save state and disables all writes', () => {
  const html = renderToStaticMarkup(<TooltipProvider><PropertyClassificationControl value="office" sourceLabel="Map correction" onChange={() => {}} busy status="pending" resetLabel="Clear correction" /></TooltipProvider>)
  assert.match(html, /data-save-state="pending"/)
  assert.match(html, /Saving type/)
  assert.equal((html.match(/disabled=""/g) || []).length, 6)
  assert.match(html, /data-testid="asset-type-label"[^>]*>Office</)
})
