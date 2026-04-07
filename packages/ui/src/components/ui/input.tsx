"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@nodiox/utils"

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { isError?: boolean; containerClassName?: string }
>(function Input({ className, containerClassName, type, isError, ...props }, ref) {
  return (
    <div className={cn("group relative", containerClassName ?? "w-full")}>
      <InputPrimitive
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "flex h-9 w-full bg-transparent py-1 text-base text-start rtl:text-right transition-colors outline-none",
          "rounded-none border-b-2 px-0",
          isError
            ? "border-destructive group-focus-within:border-transparent"
            : "border-input group-focus-within:border-transparent",
          "placeholder:text-zinc-400",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
          "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      />
      {/* ShineBorder Underline — exact Gemini Live edge-to-edge sweep */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-[2px] w-full origin-left rtl:origin-right overflow-hidden rounded-full transition-all duration-700 ease-in-out",
          isError ? "scale-x-100 bg-destructive" : "scale-x-0 group-focus-within:scale-x-100"
        )}
      >
        {!isError && (
          <div
            className="absolute inset-0 animate-shine rtl:-scale-x-100"
            style={{
              backgroundImage: `radial-gradient(transparent, transparent, #4285F4, #9B72CB, #D96570, #1AA260, transparent, transparent)`,
              backgroundSize: "300% 300%",
            }}
          />
        )}
      </div>
    </div>
  )
})

export { Input }
