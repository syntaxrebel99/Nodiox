import { useState, useRef, useEffect } from "react"

interface UseMfaLogicProps {
  length?: number
  onComplete: (otpStr: string) => void
  onResend?: () => Promise<void> | void
}

export function useMfaLogic({ length = 6, onComplete, onResend }: UseMfaLogicProps) {
  const [otp, setOtp] = useState<string[]>(new Array(length).fill(""))
  const [isOtpComplete, setIsOtpComplete] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [isResending, setIsResending] = useState(false)
  
  const mfaInputRefs = useRef<(HTMLInputElement | null)[]>([])
  
  const [timer, setTimer] = useState(60)
  const [stepTime, setStepTime] = useState(0)
  const [resendSuccess, setResendSuccess] = useState(false)

  // Auto-focus first input on mount
  useEffect(() => {
    const timerId = setTimeout(() => {
      mfaInputRefs.current[0]?.focus()
    }, 100)
    return () => clearTimeout(timerId)
  }, [])

  // Resend countdown timer
  useEffect(() => {
    const interval: NodeJS.Timeout = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [timer])

  // Global step time tracker
  useEffect(() => {
    const interval: NodeJS.Timeout = setInterval(() => setStepTime((prev) => prev + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const handleOtpChange = (value: string, index: number) => {
    if (otpError) setOtpError(null)
    if (resendSuccess) setResendSuccess(false)
    const newOtp = [...otp]
    const nextDigit = value.replace(/\D/g, "").slice(-1)
    newOtp[index] = nextDigit
    setOtp(newOtp)

    if (nextDigit && index < length - 1) {
      mfaInputRefs.current[index + 1]?.focus()
    }

    const complete = newOtp.every(digit => digit !== "")
    setIsOtpComplete(complete)

    if (complete) {
      onComplete(newOtp.join(""))
    }
  }

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      mfaInputRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    if (otpError) setOtpError(null)
    if (resendSuccess) setResendSuccess(false)
    const data = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length).split("")
    const newOtp = [...otp]
    data.forEach((char, idx) => { if (idx < length) newOtp[idx] = char })
    setOtp(newOtp)
    
    const nextFocus = data.length < length ? data.length : length - 1
    mfaInputRefs.current[nextFocus]?.focus()

    const complete = newOtp.every(digit => digit !== "")
    setIsOtpComplete(complete)
    if (complete) {
      onComplete(newOtp.join(""))
    }
  }

  const [resendCount, setResendCount] = useState(0)

  const triggerResend = async () => {
    if (resendCount >= 3 || isResending) return

    setIsResending(true)

    try {
      if (onResend) {
        await onResend()
      }

      setResendCount(prev => prev + 1)
      setTimer(60)
      setResendSuccess(true)
      setOtpError(null)
      setStepTime(0)
      setTimeout(() => setResendSuccess(false), 4000)
    } finally {
      setIsResending(false)
    }
  }

  const handleFocus = (index: number) => {
    if (resendSuccess) setResendSuccess(false)
    if (otpError) setOtpError(null)
    setStepTime(0) 
    
    // Check real DOM values since state might be stale
    const firstEmptyIndex = mfaInputRefs.current.findIndex(el => !el?.value)
    const targetIndex = firstEmptyIndex === -1 ? length - 1 : firstEmptyIndex
    if (index !== targetIndex && index > targetIndex) {
      mfaInputRefs.current[targetIndex]?.focus()
    }
  }

  return {
    otp,
    isOtpComplete,
    otpError,
    setOtpError,
    mfaInputRefs,
    timer,
    stepTime,
    resendSuccess,
    isResending,
    triggerResend,
    resendCount,
    handleOtpChange,
    handleOtpKeyDown,
    handleOtpPaste,
    handleFocus
  }
}
