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

describe("API: /api/auth/login", () => {
  test("should reject missing credentials when CSRF is valid", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: withForwardedIp(csrfHeaders, "198.51.100.10"),
      body: JSON.stringify({ password: "Password123!" }),
    });
    
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, "Invalid request format");
  });

  test("should reject state-changing requests without CSRF", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: withForwardedIp({ "Content-Type": "application/json" }, "198.51.100.11"),
      body: JSON.stringify({ email: "test@example.com", password: "Password123!" }),
    });
    
    assert.strictEqual(res.status, 403);
  });
});
