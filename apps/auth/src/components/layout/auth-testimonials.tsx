"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { cn } from "@nodiox/utils"
import { AppSettings } from "@nodiox/ui"

interface AuthTestimonialsProps {
  className?: string
}

export function AuthTestimonials({ className }: AuthTestimonialsProps) {
  const t = useTranslations("Testimonials")
  const [index, setIndex] = useState<number>(1)
  const [isVisible, setIsVisible] = useState(true)

  // Pre-define all testimonials targeting next-intl to prevent image reloading blinks
  const testimonials = [1, 2, 3].map((i) => ({
      id: i,
      quote: t(`${i}.quote`),
      author: t(`${i}.author`),
      handle: t(`${i}.handle`),
      avatar: `/avatars/avatar-${i}.png`,
  }))

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false)
      setTimeout(() => {
        setIndex((prev) => (prev % 3) + 1)
        setIsVisible(true)
      }, 2000)
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className={cn(
        "relative hidden bg-neutral-50 dark:bg-neutral-950 lg:flex flex-col items-center justify-center p-12 overflow-hidden border-l border-neutral-200 dark:border-white/5",
        className
      )}
    >
      {/* CSS Grid stack — all elements in DOM, perfectly overlapping */}
      <div className="grid relative z-10 max-w-lg w-full">
        {testimonials.map((testimonial) => {
          const isActive = index === testimonial.id
          const show = isActive && isVisible

          return (
            <div
              key={testimonial.id}
              className={cn(
                "col-start-1 row-start-1 transition-all duration-[2000ms] ease-in-out",
                show
                  ? "opacity-100 translate-y-0 z-10"
                  : "opacity-0 translate-y-4 pointer-events-none z-0"
              )}
            >
              <div className="relative mb-12">
                {/* Top Quote (Left in LTR, Right in RTL) */}
                <span className="font-serif text-[180px] text-[#4d4d4d4d] absolute -top-[90px] -left-[60px] rtl:left-auto rtl:-right-[60px] rtl:-scale-x-100 leading-none select-none">
                  &ldquo;
                </span>

                <blockquote className="text-3xl font-medium leading-relaxed text-neutral-900 dark:text-zinc-100 tracking-tight relative z-10 bg-transparent">
                  {testimonial.quote}
                  {/* Bottom Quote (Right in LTR, Left in RTL) */}
                  <span className="font-serif text-[180px] text-[#4d4d4d4d] absolute -bottom-[120px] -right-[50px] rtl:right-auto rtl:-left-[50px] rtl:-scale-x-100 leading-none select-none pointer-events-none">
                    &rdquo;
                  </span>
                </blockquote>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative size-14 rounded-full overflow-hidden border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl">
                  {/* All 3 images stay in DOM — no flicker on transition */}
                  <Image
                    src={testimonial.avatar}
                    alt={testimonial.author}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="flex flex-col text-left rtl:text-right">
                  <span className="font-bold text-neutral-900 dark:text-zinc-100 text-lg">
                    {testimonial.author}
                  </span>
                  <span className="text-sm text-zinc-500 font-medium">
                    {testimonial.handle}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      
      {/* App Settings Toggle (replaces Theme Toggle) */}
      <AppSettings />
    </div>
  )
}
