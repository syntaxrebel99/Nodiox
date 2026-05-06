import { z } from "zod";

// Duplicated from auth app for frontend-only phase. To be moved to shared workspace later.
export function validatePhoneNumber(phone: string, defaultCountry = "DZ") {
  // Very basic regex for initial frontend phase context
  const regex = /^\+[1-9]\d{1,14}$/;
  if (phone.startsWith("0")) return false; // Simple rule
  return regex.test(phone.startsWith("+") ? phone : `+${phone}`);
}

export const createOnboardingSchema = (locale: string) => z.object({
  fullName: z
    .string()
    .min(1, "fullNameRequired")
    .refine(
      (value) => {
        let validChars;
        if (locale === "ar") {
          validChars = /^[\p{Script=Arabic}\s'-]+$/u.test(value);
        } else {
          validChars = /^[\p{Script=Latin}\s'-]+$/u.test(value);
        }
        if (!validChars) return false;

        if (/^[\s'-]|[\s'-]$/.test(value)) return false;
        if (/--|''|-\s|\s-|'\s|\s'/.test(value)) return false;

        const words = value.trim().split(/\s+/);
        if (words.length < 2 || words.length > 4) return false;

        return words.every((word) =>
          word.split('-').every(part => {
            if (part.length === 0) return false;
            return !/^[\p{Ll}]/u.test(part);
          })
        );
      },
      { message: "fullNameError" }
    ),
  email: z.string().email("emailError").min(1, "emailRequired"),
  phoneNumber: z.string().optional().superRefine(
    (value, ctx) => {
      if (!value || value === "") return;
      if (!validatePhoneNumber(value, "DZ")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "phoneError",
        });
      }
    }
  ),
  password: z.string().min(8, "pwdReqLength").refine(val => /[A-Z]/.test(val) && /[a-z]/.test(val), "pwdReqNumber").refine(val => /\d/.test(val) && /[^A-Za-z0-9]/.test(val), "pwdReqSpecial"),
  confirmPassword: z.string().min(1, "passwordRequired"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "passwordsMustMatch",
  path: ["confirmPassword"],
});

export type OnboardingData = z.infer<ReturnType<typeof createOnboardingSchema>>;
