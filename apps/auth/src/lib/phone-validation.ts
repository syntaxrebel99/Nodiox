/**
 * Supported phone regions and their validation patterns.
 */
export const SUPPORTED_PHONE_REGIONS: Record<string, RegExp> = {
  // Algerian Mobile check (+213, 00213, or 0 followed by 5/6/7 and 8 digits)
  DZ: /^(?:\+213|00213|0)[567]\d{8}$/,
};

/**
 * Standardizes phone numbers by removing spaces, hyphens, and parentheses.
 */
export function cleanPhoneNumber(value: string): string {
  return value.replace(/[\s\-()]/g, "");
}

/**
 * Validates a phone number against supported region patterns.
 */
export function validatePhoneNumber(phone: string, region: string = "DZ"): boolean {
  const cleaned = cleanPhoneNumber(phone);
  const pattern = SUPPORTED_PHONE_REGIONS[region];
  
  if (!pattern) {
    return false;
  }
  
  return pattern.test(cleaned);
}
