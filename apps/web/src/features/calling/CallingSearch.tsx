import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, LoaderCircle, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/queryClient'
import { callingSearchQuery, resolveCallingSearchContact, type CallingSearchResponse, type CallingSearchRow } from '@/lib/callingSearch'
import type { CallingContact, CallingWorkspace } from '@/lib/mobileCalling'

export function CallingSearch({ brokerId, locked, onSelect }: {
  brokerId: string; locked: boolean; onSelect: (workspace: CallingWorkspace, contact: CallingContact) => boolean
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const query = callingSearchQuery(text)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selecting, setSelecting] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState('')
  const generation = useRef(0)
  const current = useRef({ locked, query })
  current.current = { locked, query }
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => {
    if (locked) { generation.current += 1; setSelecting(null); setSelectionError('') }
  }, [locked])
  useEffect(() => () => { generation.current += 1 }, [])
  const results = useQuery<CallingSearchResponse>({
    queryKey: ['/api/calling/search', brokerId, debouncedQuery],
    enabled: !locked && query.length >= 2 && query === debouncedQuery,
    queryFn: async () => (await apiRequest('GET', '/api/calling/search?q=' + encodeURIComponent(debouncedQuery) + '&limit=10')).json(),
    staleTime: 15_000, retry: false,
  })
  const matchingResults = query.length >= 2 && query === debouncedQuery
  const change = (value: string) => {
    generation.current += 1
    setText(value); setSelecting(null); setSelectionError('')
  }
  const select = async (row: CallingSearchRow) => {
    if (current.current.locked || selecting) return
    const request = ++generation.current
    const selectedQuery = query
    setSelecting(row.prospect.id + ':' + (row.contact.id || 'primary'))
    setSelectionError('')
    try {
      const workspace = await queryClient.fetchQuery<CallingWorkspace>({
        queryKey: ['/api/calling/workspace', brokerId, row.prospect.id],
        queryFn: async () => (await apiRequest('GET', '/api/calling/prospects/' + encodeURIComponent(row.prospect.id) + '/workspace')).json(),
        staleTime: 0,
      })
      if (request !== generation.current || current.current.locked || current.current.query !== selectedQuery) return
      const contact = resolveCallingSearchContact(row, workspace)
      if (!contact) { setSelectionError('This contact changed. Search again to select the current saved contact.'); return }
      if (onSelect(workspace, contact)) change('')
    } catch {
      if (request === generation.current && !current.current.locked && current.current.query === selectedQuery) setSelectionError('Could not load this contact. Try selecting it again.')
    } finally {
      if (request === generation.current) setSelecting(null)
    }
  }
  return <section aria-label="Find a saved contact" className="rounded-xl border border-blue-100 bg-white p-4">
    <label htmlFor="calling-search" className="mb-2 block text-sm font-medium text-slate-800">Find a contact</label>
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
      <Input id="calling-search" type="search" autoComplete="off" maxLength={120} value={text} disabled={locked} onChange={(event) => change(event.target.value)} aria-label="Search saved people or companies" placeholder="Name or company" className="h-11 pl-9 pr-10 text-sm [&::-webkit-search-cancel-button]:hidden" />
      {text ? <Button variant="ghost" size="icon" aria-label="Clear contact search" className="absolute right-1 top-1 h-9 w-9" disabled={locked} onClick={() => change('')}><X aria-hidden="true" className="h-4 w-4" /></Button> : null}
    </div>
    {locked ? <p className="mt-2 text-xs text-slate-500">Finish or undo your current call to select another contact.</p> : query.length === 1 ? <p className="mt-2 text-xs text-slate-500">Type at least two characters.</p> : query.length >= 2 ? <div className="mt-2">
      {selectionError ? <p role="alert" className="mb-2 text-xs text-amber-800">{selectionError}</p> : null}
      {!matchingResults || results.isLoading || results.isFetching ? <p role="status" className="py-2 text-xs text-slate-500">Searching saved contacts…</p> : results.isError ? <div className="py-2"><p role="alert" className="text-xs text-amber-800">Contact search unavailable.</p><Button variant="ghost" className="mt-1 h-9 px-2 text-xs" onClick={() => results.refetch()}>Retry search</Button></div> : !results.data?.rows.length ? <p role="status" className="py-2 text-xs text-slate-500">No saved contacts match. Try the person or company name.</p> : <>
        <ul className="max-h-80 divide-y divide-blue-50 overflow-y-auto" aria-label="Matching saved contacts">
          {results.data.rows.map((row) => {
            const person = row.contact.name || 'Company contact'
            const company = row.companyName || row.prospect.businessName || row.contact.company || row.prospect.name
            const key = row.prospect.id + ':' + (row.contact.id || 'primary')
            return <li key={key}><button type="button" aria-label={'Select ' + person + ' at ' + company} disabled={Boolean(selecting)} onClick={() => select(row)} className="flex min-h-14 w-full items-center gap-3 rounded px-1 py-3 text-left hover:bg-blue-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 disabled:opacity-60">
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium text-slate-800">{person}</span><span className="mt-0.5 block break-words text-xs text-slate-500">{company}{row.contact.title ? ' · ' + row.contact.title : ''}</span>{row.prospect.address ? <span className="mt-0.5 block break-words text-[11px] text-slate-500">{row.prospect.address}</span> : null}<span className="mt-1 block text-xs tabular-nums text-slate-600">{row.contact.phone || (row.contact.hasAdditionalPhones ? 'Numbers saved on contact' : 'No number saved')}</span></span>
              {selecting === key ? <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-blue-600" /> : <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />}
            </button></li>
          })}
        </ul>
        {results.data.hasMore ? <p className="mt-2 text-xs text-slate-500">More matches. Add a person or company name to narrow the search.</p> : null}
      </>}
    </div> : <p className="mt-2 text-xs text-slate-500">Search all your saved people and companies.</p>}
  </section>
}
