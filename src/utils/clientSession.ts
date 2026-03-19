const CLIENT_SESSION_ID_KEY = 'clientSessionId'

function createSessionId() {
  return crypto.randomUUID()
}

export function hasClientSessionId(): boolean {
  return !!sessionStorage.getItem(CLIENT_SESSION_ID_KEY)
}

export function getClientSessionId(): string {
  let id = sessionStorage.getItem(CLIENT_SESSION_ID_KEY)
  if (!id) {
    id = createSessionId()
    sessionStorage.setItem(CLIENT_SESSION_ID_KEY, id)
  }
  return id
}

export function resetClientSessionId(): string {
  const id = createSessionId()
  sessionStorage.setItem(CLIENT_SESSION_ID_KEY, id)
  return id
}
