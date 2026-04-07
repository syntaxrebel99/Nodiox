import { globalCsrfToken } from "~/components/providers/csrf-provider"

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

  // Inject current CSRF token securely
  if (globalCsrfToken) {
    headers.set("x-csrf-token", globalCsrfToken)
  }

  return fetch(url, {
    ...options,
    headers,
  })
}
