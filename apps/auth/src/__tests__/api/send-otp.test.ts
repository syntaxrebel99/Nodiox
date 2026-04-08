import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";

describe("API: /api/auth/send-otp", () => {
  test("should reject invalid email format", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invalid-email" }),
    });
    
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });

  test("should enforce rate limiting on repeated requests", async () => {
    const email = `test-rate-limit-${Date.now()}@example.com`;
    
    // We expect the rate limit to hit after a few requests (config is 5 per 10min)
    // For testing, we just try a few times.
    const results = [];
    for (let i = 0; i < 7; i++) {
       const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      results.push(res.status);
    }
    
    assert.ok(results.includes(429), "Expected to hit 429 Too Many Requests");
  });
});
