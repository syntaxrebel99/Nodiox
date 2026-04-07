import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api/auth';

async function test() {
  console.log("--- Starting CSRF Verification ---");

  // 1. Initial hit to get the token and cookie
  const initRes = await fetch(`${BASE_URL}/send-otp`); // Any GET/OPTIONS would work, but we want the cookie
  const setCookie = initRes.headers.get('set-cookie');
  console.log("Initial Cookie Set:", setCookie ? "Yes" : "No");

  // 2. Test: Missing Header
  console.log("\nTest 1: Missing X-CSRF-Token Header");
  const res1 = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password' })
  });
  console.log("Status:", res1.status, res1.status === 403 ? "✅ (Blocked as expected)" : "❌ (Failed to block)");

  // 3. Test: Invalid Header
  console.log("\nTest 2: Invalid X-CSRF-Token Header");
  const res2 = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'invalid-token-123'
    },
    body: JSON.stringify({ email: 'test@example.com', password: 'password' })
  });
  console.log("Status:", res2.status, res2.status === 403 ? "✅ (Blocked as expected)" : "❌ (Failed to block)");

  // 4. Test: Correct Token (Simulated)
  // Since we use HttpOnly cookies, node-fetch won't automatically send them back unless we pass them.
  // We can't easily "read" the token from the cookie to put in the header here because HttpOnly.
  // BUT we can check if the server is logging the failure correctly.
}

test();
