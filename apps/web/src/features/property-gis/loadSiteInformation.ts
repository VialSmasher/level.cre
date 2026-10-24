import { PropertySiteInformationPreviewSchema } from '@level-cre/shared'

export type SiteInformationLoader = (signal: AbortSignal) => Promise<unknown>
export class SiteInformationLoadError extends Error {}

export class SiteInformationTimeoutError extends Error {
  constructor() { super('Municipal lookup took too long. Try again.'); this.name = 'SiteInformationTimeoutError' }
}

// Bound the whole client wait, including session lookup and response-body parsing.
export async function loadSiteInformation(load: SiteInformationLoader, controller: AbortController, timeoutMs = 20_000) {
  if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException('Cancelled', 'AbortError'))
    controller.signal.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      reject(new SiteInformationTimeoutError())
      controller.abort()
    }, timeoutMs)
  })
  try {
    return PropertySiteInformationPreviewSchema.parse(await Promise.race([load(controller.signal), deadline]))
  } finally {
    clearTimeout(timer)
    if (onAbort) controller.signal.removeEventListener('abort', onAbort)
  }
}
