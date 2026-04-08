/**
 * A wrapper around native fetch that automatically injects
 * the required CSRF headers and Content-Type for API Route handlers.
 */
export async function apiFetch(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {})
  
  // Standardize JSON requests
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  // Option C (Double Submit): read CSRF token from non-HttpOnly cookie
  // and echo it in a header for state-changing requests.
  const method = (options.method ?? "GET").toUpperCase()
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"])
  if (!safeMethods.has(method)) {
    const csrfToken = readCookie("nodiox_csrf_token")
    if (csrfToken) headers.set("x-csrf-token", csrfToken)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  return response
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapeRegex(name)}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
