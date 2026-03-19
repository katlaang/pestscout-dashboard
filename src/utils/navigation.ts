import type { NavigateFunction } from 'react-router-dom'

let appNavigate: NavigateFunction | null = null

export function setAppNavigate(navigate: NavigateFunction | null) {
  appNavigate = navigate
}

export function navigateTo(path: string, options?: { replace?: boolean }) {
  if (appNavigate) {
    appNavigate(path, { replace: options?.replace ?? false })
    return
  }

  const { replace = false } = options ?? {}
  if (replace) {
    window.history.replaceState(null, '', path)
  } else {
    window.history.pushState(null, '', path)
  }
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigateToLogin(reason?: string, replace = true) {
  const path = reason ? `/login?reason=${encodeURIComponent(reason)}` : '/login'
  navigateTo(path, { replace })
}
