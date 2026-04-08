import { z } from "zod";
import { passwordSchema } from "./password-schemas";

/**
 * Validation schema for the onboarding flow.
 */
export const createOnboardingSchema = (locale: string) => z.object({
  fullName: z
    .string()
    .min(1, "fullNameRequired")
    .refine(
      (value) => {
        // Allowed: Letters based on locale, spaces, hyphens, apostrophes
        let validChars;
        if (locale === "ar") {
          validChars = /^[\p{Script=Arabic}\s'-]+$/u.test(value);
        } else {
          validChars = /^[\p{Script=Latin}\s'-]+$/u.test(value);
        }
        if (!validChars) return false;

        // Prevent leading/trailing special characters and consecutive special chars
        if (/^[\s'-]|[\s'-]$/.test(value)) return false;
        if (/--|''|-\s|\s-|'\s|\s'/.test(value)) return false;

        const words = value.trim().split(/\s+/);
        // Requirement: At least 2 words, max 4 words
        if (words.length < 2 || words.length > 4) return false;

        // Requirement: Each word (or hyphenated part) must not start with a lowercase letter.
        return words.every((word) =>
          word.split('-').every(part => {
            if (part.length === 0) return false; // Reject empty parts (e.g. consecutive hyphens missed)
            return !/^[\p{Ll}]/u.test(part);
          })
        );
      },
      {
        message: "fullNameError",
      }
    ),
  email: z.string().email("emailError").min(1, "emailRequired"),
  phoneNumber: z.string().optional().superRefine(
    (value, ctx) => {
      if (!value || value === "") return;
      const cleaned = value.replace(/[\s\-()]/g, "");

      // Strict Algerian Mobile check (+213, 00213, or 0 followed by 5/6/7 and 8 digits)
      if (!/^(?:\+213|00213|0)[567]\d{8}$/.test(cleaned)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "phoneError",
        });
      }
    }
  ),
  password: passwordSchema(),
  confirmPassword: z.string().min(1, "passwordRequired"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "passwordsMustMatch",
  path: ["confirmPassword"],
});

export type OnboardingData = z.infer<ReturnType<typeof createOnboardingSchema>>;
