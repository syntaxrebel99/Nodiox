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
    let interval: NodeJS.Timeout
    if (timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000)
    }
    return () => clearInterval(interval)
  }, [timer])

  // Global step time tracker
  useEffect(() => {
    let interval: NodeJS.Timeout
    interval = setInterval(() => setStepTime((prev) => prev + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const handleOtpChange = (value: string, index: number) => {
    if (otpError) setOtpError(null)
    if (resendSuccess) setResendSuccess(false)
    const newOtp = [...otp]
    newOtp[index] = value.substring(value.length - 1)
    setOtp(newOtp)

    if (value && index < length - 1) {
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
    const data = e.clipboardData.getData("text").slice(0, length).split("")
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
    if (resendCount >= 3) return
    
    if (onResend) {
      await onResend()
    }

    setResendCount(prev => prev + 1)
    setTimer(60)
    setResendSuccess(true)
    setOtpError(null)
    setStepTime(0)
    setTimeout(() => setResendSuccess(false), 4000)
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
    triggerResend,
    resendCount,
    handleOtpChange,
    handleOtpKeyDown,
    handleOtpPaste,
    handleFocus
  }
}
