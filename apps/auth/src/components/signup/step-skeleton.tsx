import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@nodiox/utils"

export function StepSkeleton() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-6 w-full"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        {/* Animated Icon Placeholder */}
        <div className="mb-2 h-12 w-12 rounded-full bg-muted animate-pulse" />
        
        {/* Title Placeholder */}
        <div className="h-8 w-48 rounded bg-muted animate-pulse mb-1" />
        
        {/* Subtitle Placeholder */}
        <div className="h-4 w-64 rounded bg-muted animate-pulse" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          {/* Label Placeholder */}
          <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          {/* Input Placeholder */}
          <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        {/* Primary Button Placeholder */}
        <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
        {/* Back Button Placeholder */}
        <div className="h-4 w-12 mx-auto rounded bg-muted animate-pulse" />
      </div>
    </motion.div>
  )
}
