import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";

describe("API: /api/auth/login", () => {
  test("should reject missing credentials", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginMethod: "email" }),
    });
    
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });

  test("should reject invalid login method", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginMethod: "invalid", email: "test@example.com", password: "Password123!" }),
    });
    
    assert.strictEqual(res.status, 400);
  });
});
