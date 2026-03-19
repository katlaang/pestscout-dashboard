import { getClientSessionId } from '@/utils/clientSession'
import { useSessionConnectionStore } from '@/hooks/useSessionConnection'

interface StartOptions {
  token: string
  clientSessionId?: string
  onSessionReplaced: () => void
}

function apiBaseUrl() {
  return import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function isSessionReplacedEvent(eventName: string, data: string) {
  if (eventName === 'session-replaced') return true

  const parsed = parseJson<Record<string, unknown>>(data)
  const code = typeof parsed?.errorCode === 'string' ? parsed.errorCode : null
  const type = typeof parsed?.type === 'string' ? parsed.type : null
  const event = typeof parsed?.event === 'string' ? parsed.event : null

  return (
    code === 'SESSION_REPLACED' ||
    type === 'SESSION_REPLACED' ||
    event === 'session-replaced' ||
    data.includes('SESSION_REPLACED')
  )
}

class SessionEventStream {
  private controller: AbortController | null = null
  private retryTimer: number | null = null
  private token: string | null = null
  private clientSessionId: string | null = null
  private onSessionReplaced: (() => void) | null = null
  private active = false
  private retryAttempt = 0

  start({ token, clientSessionId = getClientSessionId(), onSessionReplaced }: StartOptions) {
    const sameConnection =
      this.active &&
      this.token === token &&
      this.clientSessionId === clientSessionId &&
      this.controller

    this.onSessionReplaced = onSessionReplaced
    if (sameConnection) return

    this.stop()
    this.active = true
    this.retryAttempt = 0
    this.token = token
    this.clientSessionId = clientSessionId
    this.onSessionReplaced = onSessionReplaced
    this.setConnectionState('connecting', 'Connecting to live session updates...')
    void this.connect()
  }

  stop() {
    this.active = false
    this.retryAttempt = 0
    this.token = null
    this.clientSessionId = null
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.controller) {
      this.controller.abort()
      this.controller = null
    }
    useSessionConnectionStore.getState().resetConnectionState()
  }

  private setConnectionState(status: 'connecting' | 'connected' | 'reconnecting' | 'offline', message?: string | null) {
    useSessionConnectionStore.getState().setConnectionState(status, message ?? null)
  }

  private scheduleReconnect() {
    if (!this.active || this.retryTimer) return
    this.retryAttempt += 1
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false
    const delay = isOffline
      ? 15000
      : Math.min(3000 * 2 ** Math.min(this.retryAttempt - 1, 4), 30000)

    this.setConnectionState(
      isOffline ? 'offline' : 'reconnecting',
      isOffline
        ? 'Your device is offline. Waiting to restore live session updates...'
        : 'Live session updates were interrupted. Reconnecting...',
    )

    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, delay)
  }

  private async connect() {
    if (!this.active || !this.token || !this.clientSessionId) return

    const controller = new AbortController()
    this.controller = controller

    try {
      const response = await fetch(`${apiBaseUrl()}/api/auth/session/events`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.token}`,
          'X-Client-Session-Id': this.clientSessionId,
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
        signal: controller.signal,
      })

      if (!response.ok) {
        let errorCode: string | null = null
        try {
          const payload = await response.json()
          errorCode = typeof payload?.errorCode === 'string' ? payload.errorCode : null
        } catch {
          errorCode = null
        }

        if (response.status === 401 && (errorCode === 'SESSION_REPLACED' || errorCode === 'SESSION_INVALID')) {
          this.stop()
          this.onSessionReplaced?.()
          return
        }

        throw new Error(`Failed to connect to session events: ${response.status}`)
      }

      this.retryAttempt = 0
      this.setConnectionState('connected')
      await this.consume(response, controller.signal)

      if (this.active && !controller.signal.aborted) {
        this.scheduleReconnect()
      }
    } catch {
      if (!controller.signal.aborted) {
        this.scheduleReconnect()
      }
    } finally {
      if (this.controller === controller) {
        this.controller = null
      }
    }
  }

  private async consume(response: Response, signal: AbortSignal) {
    if (!response.body) return

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (!signal.aborted) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '')

      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        this.handleEventBlock(rawEvent)
        boundary = buffer.indexOf('\n\n')
      }
    }
  }

  private handleEventBlock(rawEvent: string) {
    if (!rawEvent.trim()) return

    let eventName = 'message'
    const dataLines: string[] = []

    rawEvent.split('\n').forEach(line => {
      if (!line || line.startsWith(':')) return
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
        return
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    })

    const data = dataLines.join('\n')
    if (isSessionReplacedEvent(eventName, data)) {
      this.stop()
      this.onSessionReplaced?.()
    }
  }
}

export const sessionEventStream = new SessionEventStream()
