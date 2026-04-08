import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
const ORIGIN = new URL(BASE_URL).origin;

const csrfHeaders = {
  "Content-Type": "application/json",
  Origin: ORIGIN,
  "x-csrf-token": "test-csrf-token",
  Cookie: "nodiox_csrf_token=test-csrf-token",
};

function withForwardedIp(headers: Record<string, string>, ip: string) {
  return {
    ...headers,
    "x-forwarded-for": ip,
  };
}

describe("API: /api/auth/verify-otp", () => {
  test("should reject email login MFA without a pending login challenge", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: "POST",
      headers: withForwardedIp(csrfHeaders, "198.51.100.40"),
      body: JSON.stringify({
        email: "test@example.com",
        token: "123456",
        type: "email",
        flow: "login",
      }),
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, "Your login verification session has expired. Please log in again.");
  });

  test("should reject phone login MFA without a pending login challenge", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: "POST",
      headers: withForwardedIp(csrfHeaders, "198.51.100.41"),
      body: JSON.stringify({
        phone: "+213555123456",
        token: "123456",
        type: "sms",
        flow: "login",
      }),
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, "Your login verification session has expired. Please log in again.");
  });
});
