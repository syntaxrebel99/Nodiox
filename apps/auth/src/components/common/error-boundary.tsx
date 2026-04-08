"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"
import { useTranslations } from "next-intl"
import { ShimmerButton } from "@nodiox/ui"
import Image from "next/image"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

class ErrorBoundaryInternal extends Component<Props & { t: any }, State> {
  public state: State = {
    hasError: false
  }

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      const { t } = this.props
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center p-6">
          <div className="relative mb-2 flex h-16 w-16 items-center justify-center">
            <Image
              src="https://fonts.gstatic.com/s/e/notoemoji/latest/26a0_fe0f/512.webp"
              alt="⚠️"
              width={64}
              height={64}
              unoptimized
            />
          </div>
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground max-w-sm text-balance">
            We encountered an unexpected error while rendering this page.
          </p>
          <ShimmerButton
            className="mt-2 min-w-[200px]"
            onClick={() => {
              this.setState({ hasError: false })
              window.location.reload()
            }}
          >
            Try Again
          </ShimmerButton>
        </div>
      )
    }

    return this.props.children
  }
}

export function ErrorBoundary({ children }: Props) {
  // We can't use useTranslations directly in a class component, 
  // so we wrap it here or pass it as prop if needed.
  return <ErrorBoundaryInternal t={null}>{children}</ErrorBoundaryInternal>
}
