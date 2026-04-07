import { globalCsrfToken, updateGlobalCsrfToken } from "~/components/providers/csrf-provider"

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

  const response = await fetch(url, {
    ...options,
    headers,
  })

  // If the server rotated the CSRF token, it will send the new one in the response header
  const rotatedToken = response.headers.get("x-csrf-token")
  if (rotatedToken) {
    updateGlobalCsrfToken(rotatedToken)
  }

  return response
}
