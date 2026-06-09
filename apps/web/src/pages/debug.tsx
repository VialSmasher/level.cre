import React from 'react'
import { getGoogleMapsApiKey } from '@/lib/googleMapsApiKey'

export default function DebugPage() {
  const mode = import.meta.env.MODE
  const demo = String(import.meta.env.VITE_DEMO_MODE || '')
  const sha = String(import.meta.env.VITE_COMMIT_SHA || '')
  const mapsKey = getGoogleMapsApiKey()
  const env = import.meta.env as ImportMetaEnv & {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string
    GOOGLE_MAPS_API_KEY?: string
  }
  const mapsKeySource =
    env.VITE_GOOGLE_MAPS_API_KEY?.trim() ? 'VITE_GOOGLE_MAPS_API_KEY' :
    env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ? 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' :
    env.GOOGLE_MAPS_API_KEY?.trim() ? 'GOOGLE_MAPS_API_KEY' :
    'unset'

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-sm">
        <h1 className="text-base font-semibold mb-3">Debug</h1>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">mode</span><span className="font-mono">{mode}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">VITE_DEMO_MODE</span><span className="font-mono">{demo || 'unset'}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">VITE_COMMIT_SHA</span><span className="font-mono">{sha || 'unknown'}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Maps key</span><span className="font-mono">{mapsKey ? 'present' : 'unset'}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Maps key source</span><span className="font-mono">{mapsKeySource}</span></div>
        </div>
      </div>
    </div>
  )
}

