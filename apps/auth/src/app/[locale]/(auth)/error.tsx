"use client"

import { useEffect } from "react"
import { ShimmerButton } from "@nodiox/ui"
import Image from "next/image"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to our custom structured logger
    console.error("Auth Page Error:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center py-10">
      <div className="relative mb-2 flex h-16 w-16 items-center justify-center">
        <Image
          src="https://fonts.gstatic.com/s/e/notoemoji/latest/26a0_fe0f/512.webp"
          alt="⚠️"
          width={64}
          height={64}
          unoptimized
        />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-muted-foreground max-w-sm text-balance text-sm">
          An unexpected error occurred in the authentication flow. 
          Please try again or contact support if the issue persists.
        </p>
      </div>
      <ShimmerButton
        className="mt-4 min-w-[200px]"
        onClick={() => reset()}
      >
        Try Again
      </ShimmerButton>
      <button 
        onClick={() => window.location.href = "/"}
        className="text-xs text-muted-foreground hover:underline"
      >
        Go back home
      </button>
    </div>
  )
}
