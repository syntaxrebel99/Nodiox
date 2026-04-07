"use client"

import * as React from "react"
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react"
import confetti, {
  type GlobalOptions as ConfettiGlobalOptions,
  type Options as ConfettiOptions,
  type CreateTypes as ConfettiInstance,
} from "canvas-confetti"

type Api = {
  fire: (options?: ConfettiOptions) => void
}

type Props = React.ComponentPropsWithRef<"canvas"> & {
  options?: ConfettiGlobalOptions
  onConstruct?: (api: Api) => void
}

const Confetti = React.forwardRef<Api, Props>((props, ref) => {
  const { options, onConstruct, ...rest } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const instanceRef = useRef<ConfettiInstance | null>(null)

  const fire = useCallback((opts?: ConfettiOptions) => {
    instanceRef.current?.(opts)
  }, [])

  const api = useMemo(() => ({ fire }), [fire])

  useImperativeHandle(ref, () => api, [api])

  useEffect(() => {
    onConstruct?.(api)
  }, [onConstruct, api])

  useEffect(() => {
    if (canvasRef.current) {
      instanceRef.current = confetti.create(canvasRef.current, {
        ...options,
        resize: true,
      })
    }
    return () => {
      instanceRef.current?.reset()
      instanceRef.current = null
    }
  }, [options])

  return (
    <canvas
      ref={canvasRef}
      {...rest}
      className={rest.className || "fixed inset-0 pointer-events-none z-[100] h-full w-full"}
    />
  )
})

Confetti.displayName = "Confetti"

export { Confetti, confetti }
export type { Api as ConfettiApi, ConfettiInstance, ConfettiOptions }
