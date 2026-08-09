export type ProspectSaveQueueStatus = 'saving' | 'saved' | 'error'

type TimerHandle = ReturnType<typeof setTimeout>

type ProspectSaveQueueOptions<TPatch extends object> = {
  save: (prospectId: string, patch: TPatch) => Promise<void>
  onStatus?: (prospectId: string, status: ProspectSaveQueueStatus) => void
  debounceMs?: number
}

/**
 * Keeps optimistic prospect edits tied to the record that produced them.
 * A flush drains edits added during an in-flight request before it resolves,
 * so map selection can safely use a save-then-switch transition.
 */
export class ProspectSaveQueue<TPatch extends object> {
  private readonly pending = new Map<string, TPatch>()
  private readonly activeFlushes = new Map<string, Promise<boolean>>()
  private readonly timers = new Map<string, TimerHandle>()

  constructor(private readonly options: ProspectSaveQueueOptions<TPatch>) {}

  enqueue(prospectId: string, patch: TPatch) {
    const current = this.pending.get(prospectId) || ({} as TPatch)
    this.pending.set(prospectId, { ...current, ...patch })
    this.options.onStatus?.(prospectId, 'saving')
    this.clearTimer(prospectId)
    const timer = setTimeout(() => {
      this.timers.delete(prospectId)
      void this.flush(prospectId)
    }, this.options.debounceMs ?? 500)
    this.timers.set(prospectId, timer)
  }

  flush(prospectId: string): Promise<boolean> {
    this.clearTimer(prospectId)
    const active = this.activeFlushes.get(prospectId)
    if (active) return active

    const flush = this.drain(prospectId).finally(() => {
      this.activeFlushes.delete(prospectId)
    })
    this.activeFlushes.set(prospectId, flush)
    return flush
  }

  pendingPatch(prospectId: string): TPatch | undefined {
    return this.pending.get(prospectId)
  }

  hasWork(prospectId: string) {
    return this.pending.has(prospectId) || this.activeFlushes.has(prospectId)
  }

  discard(prospectId: string) {
    this.clearTimer(prospectId)
    this.pending.delete(prospectId)
  }

  dispose() {
    this.timers.forEach((timer) => clearTimeout(timer))
    this.timers.clear()
  }

  private async drain(prospectId: string): Promise<boolean> {
    while (true) {
      const patch = this.pending.get(prospectId)
      if (!patch || Object.keys(patch).length === 0) {
        this.pending.delete(prospectId)
        this.options.onStatus?.(prospectId, 'saved')
        return true
      }

      this.pending.delete(prospectId)
      this.options.onStatus?.(prospectId, 'saving')
      try {
        await this.options.save(prospectId, patch)
      } catch {
        const newer = this.pending.get(prospectId) || ({} as TPatch)
        this.pending.set(prospectId, { ...patch, ...newer })
        this.options.onStatus?.(prospectId, 'error')
        return false
      }
    }
  }

  private clearTimer(prospectId: string) {
    const timer = this.timers.get(prospectId)
    if (timer) clearTimeout(timer)
    this.timers.delete(prospectId)
  }
}
