"use client"

import * as React from "react"
import { DirectionProvider as RadixDirectionProvider } from "@radix-ui/react-direction"

export function DirectionProvider({ children, ...props }: React.ComponentProps<typeof RadixDirectionProvider>) {
  return <RadixDirectionProvider {...props}>{children}</RadixDirectionProvider>
}
