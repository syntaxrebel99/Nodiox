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

describe("API: /api/auth/set-password", () => {
  test("should reject missing signup session cookie", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/set-password`, {
      method: "POST",
      headers: withForwardedIp(csrfHeaders, "198.51.100.30"),
      body: JSON.stringify({ password: "Password123!", fullName: "Test User" }),
    });
    
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, "Email verification expired or not found. Please restart signup.");
  });

  test("should reject weak passwords", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/set-password`, {
      method: "POST",
      headers: withForwardedIp(csrfHeaders, "198.51.100.31"),
      body: JSON.stringify({ password: "Password123", fullName: "Test User" }),
    });
    
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, "Password does not meet security requirements");
  });
});
