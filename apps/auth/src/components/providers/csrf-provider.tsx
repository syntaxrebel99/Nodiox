"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

interface CsrfContextType {
  csrfToken: string | null
}

export let globalCsrfToken: string | null = null

const CsrfContext = createContext<CsrfContextType>({ csrfToken: null })

export function CsrfProvider({ children, token }: { children: React.ReactNode; token: string | null }) {

  if (token && globalCsrfToken !== token) {
    globalCsrfToken = token
  }

  return (
    <CsrfContext.Provider value={{ csrfToken: token }}>
      {children}
    </CsrfContext.Provider>
  )
}

export function useCsrfToken() {
  const context = useContext(CsrfContext)
  if (!context) {
    throw new Error("useCsrfToken must be used within a CsrfProvider")
  }
  return context.csrfToken
}
