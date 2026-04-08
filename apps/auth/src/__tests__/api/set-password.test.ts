import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";

describe("API: /api/auth/set-password", () => {
  test("should reject missing signup session cookie", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "Password123!" }),
    });
    
    // Should fail because the signup_email cookie is missing
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, "Unauthorized: No active signup session found");
  });

  test("should reject weak passwords", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/set-password`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Cookie": "nodiox_signup_email=test@example.com" 
      },
      body: JSON.stringify({ password: "weak" }),
    });
    
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });
});
