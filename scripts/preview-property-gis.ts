/**
 * Public GIS preview only. Does not import Level CRE's database, application
 * startup, authentication, dotenv, migrations, private files or CRM records.
 * Run: node --import tsx scripts/preview-property-gis.ts
 */
import { createServer } from 'node:http'
import { PropertyGisLookupInputSchema } from '../packages/shared/src/propertyGis'
import { lookupEdmontonSiteInformation } from '../apps/api/src/modules/property-gis/edmontonAdapter'

const hostname = '127.0.0.1'
const port = 4175
const permittedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
const permittedOrigins = new Set(['http://127.0.0.1:5178', 'http://localhost:5178', `http://127.0.0.1:${port}`, `http://localhost:${port}`])

const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const send = (status: number, body: unknown) => {
    res.writeHead(status)
    res.end(JSON.stringify(body))
  }
  if (!permittedHosts.has(req.headers.host ?? '') || (req.headers.origin && !permittedOrigins.has(req.headers.origin))) {
    send(403, { message: 'This preview accepts local requests only.' })
    return
  }
  if (req.method === 'GET' && req.url === '/api/property-gis/health') {
    send(200, { ready: true, mode: 'public_gis_only', persistence: 'none' })
    return
  }
  if (req.method !== 'POST' || req.url !== '/api/property-gis/preview') {
    send(404, { message: 'Preview endpoint not found.' })
    return
  }
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    send(415, { message: 'Send a JSON point lookup.' })
    return
  }
  try {
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of req) {
      const part = Buffer.from(chunk)
      bytes += part.length
      if (bytes > 2048) {
        send(413, { message: 'Point lookup request is too large.' })
        return
      }
      chunks.push(part)
    }
    const parsed = PropertyGisLookupInputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (!parsed.success) {
      send(400, { message: 'Enter a valid public property location.' })
      return
    }
    const preview = await lookupEdmontonSiteInformation(parsed.data)
    send(200, { ...preview, lookupOrigin: 'public_point', persistence: 'preview_only' })
  } catch (error) {
    if (error instanceof SyntaxError) {
      send(400, { message: 'Send a valid JSON point lookup.' })
      return
    }
    send(503, { message: 'Municipal site information is unavailable. Try again later.' })
  }
})

server.requestTimeout = 15_000
server.headersTimeout = 10_000
server.listen(port, hostname, () => {
  console.log(`Public-only GIS preview listening at http://${hostname}:${port}; no database connection or persistence.`)
})
server.on('error', (error) => {
  console.error(`GIS preview did not start: ${error.message}`)
  process.exitCode = 1
})
