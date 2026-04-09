/**
 * Normalizes email addresses to prevent duplicate accounts 
 * caused by Gmail/GSuite aliases (dots and '+' suffixes).
 * 
 * Example: 'john.doe+test@gmail.com' -> 'johndoe@gmail.com'
 */
export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

export function normalizeEmail(email: string): string {
  const trimmed = sanitizeEmail(email)
  const [local, domain] = trimmed.split('@')
  
  if (!local || !domain) return trimmed

  // Handle Gmail and GSuite
  const isGmail = domain === 'gmail.com' || domain === 'googlemail.com'
  
  if (isGmail) {
    // Remove all dots and strip everything after '+'
    const normalizedLocal = local
      .replace(/\./g, '')
      .split('+')[0]
    
    return `${normalizedLocal}@${domain}`
  }

  // For non-Gmail, we still strip '+' aliases 
  // (Commonly supported by Outlook, iCloud, etc.)
  const normalizedLocal = local.split('+')[0]
  return `${normalizedLocal}@${domain}`
}
