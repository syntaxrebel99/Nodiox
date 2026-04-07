'use client'

import * as React from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from "@nodiox/utils"

interface ShimmerButtonProps extends HTMLMotionProps<'button'> {
  loading?: boolean
  shimmerDisabled?: boolean
}

function ShimmerButton({ children, className, loading, shimmerDisabled = false, ...props }: ShimmerButtonProps) {
  return (
    <motion.button
      className={cn(
        'group relative inline-flex h-9 items-center justify-center overflow-hidden rounded-full p-[1.5px] transition-all',
        className
      )}
      initial={{ '--shimmer-x': '-100%' } as any}
      animate={{ 
        '--shimmer-x': shimmerDisabled ? '-100%' : '200%',
      } as any}
      transition={{
        '--shimmer-x': {
          duration: 3,
          repeat: Infinity,
          ease: "linear"
        }
      }}
      disabled={loading || props.disabled}
      {...props}
    >
      {/* Moving Shimmer Border Background (Gemini) - Active only when NOT disabled (form valid) */}
      <div
        className={cn(
          "absolute inset-0 z-0 bg-[linear-gradient(120deg,transparent_calc(var(--shimmer-x)-25%),#4285F4_calc(var(--shimmer-x)-10%),#9B72CB_var(--shimmer-x),#D96570_calc(var(--shimmer-x)+10%),#1AA260_calc(var(--shimmer-x)+25%),transparent_calc(var(--shimmer-x)+40%))] transition-opacity duration-300",
          shimmerDisabled ? "opacity-0" : "opacity-100"
        )}
      />

      {/* Solid Inner Body - Creating the Border Effect */}
      <span className="relative z-10 flex h-full w-full items-center justify-center rounded-full bg-[#000000] dark:bg-primary px-4 text-sm font-medium text-white dark:text-primary-foreground backdrop-blur-3xl transition-colors">
        {loading ? (
          <svg className="h-4 w-4 animate-spin text-white dark:text-primary-foreground" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          children as React.ReactNode
        )}
      </span>
    </motion.button>
  )
}

export { ShimmerButton, type ShimmerButtonProps }
