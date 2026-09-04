import { TabsList, TabsTrigger } from '@/components/ui/tabs'

/** Shared navigation for CRM profiles and research-only properties. */
export function AssetProfileTabs() {
  return <TabsList aria-label="Asset profile" className="grid w-full grid-cols-3" data-testid="asset-profile-tabs">
    <TabsTrigger value="property" data-testid="asset-tab-property" className="text-xs">Property</TabsTrigger>
    <TabsTrigger value="contact" data-testid="asset-tab-contact" className="text-xs">Contact</TabsTrigger>
    <TabsTrigger value="activity" data-testid="asset-tab-activity" className="text-xs">Activity</TabsTrigger>
  </TabsList>
}
import React from 'react'
