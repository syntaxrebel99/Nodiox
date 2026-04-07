"use client"

// CSRF provider removed — no backend API to protect
export function CsrfProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
