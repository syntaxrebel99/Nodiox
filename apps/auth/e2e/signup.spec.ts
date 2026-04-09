import { test, expect, type Page } from "@playwright/test"

const fastTimerScript = () => {
  const originalSetTimeout = window.setTimeout.bind(window)
  const originalSetInterval = window.setInterval.bind(window)

  window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) =>
    originalSetTimeout(callback, typeof delay === "number" && delay >= 1000 ? 10 : delay, ...args)) as typeof window.setTimeout

  window.setInterval = ((callback: TimerHandler, delay?: number, ...args: unknown[]) =>
    originalSetInterval(callback, typeof delay === "number" && delay >= 1000 ? 10 : delay, ...args)) as typeof window.setInterval
}

async function installFastTimers(page: Page) {
  await page.addInitScript(fastTimerScript)
}

async function clickResendCode(page: Page) {
  const resendButton = page.getByRole("button", { name: /Resend code/i })
  await expect(resendButton).toBeVisible({ timeout: 5000 })
  await expect(resendButton).toBeEnabled({ timeout: 5000 })
  await resendButton.evaluate((button: HTMLButtonElement) => button.click())
}

test.describe("Signup Flow Security & MFA wiring", () => {
  test("should have security headers present", async ({ page }) => {
    const response = await page.goto("/en/signup")
    expect(response?.status()).toBe(200)

    const headers = response?.headers()

    expect(headers?.["content-security-policy"]).toBeDefined()
    expect(headers?.["x-frame-options"]).toBe("DENY")
    expect(headers?.["x-content-type-options"]).toBe("nosniff")
    expect(headers?.["referrer-policy"]).toBe("strict-origin-when-cross-origin")
  })

  test("should render the first step of signup (Name)", async ({ page }) => {
    await page.goto("/en/signup")

    await expect(page.locator("h1")).toBeVisible()
    await expect(page.locator('input[name="fullName"]')).toBeVisible()
  })

  test("email MFA resend calls the backend with the saved email", async ({ page }) => {
    let resendPayload: Record<string, unknown> | null = null

    await installFastTimers(page)
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "nodiox_onboarding_draft",
        JSON.stringify({
          step: 3,
          fullName: "John Doe",
          email: "john@example.com",
          phoneNumber: "",
        })
      )
    })

    await page.route("**/api/auth/send-otp", async (route) => {
      resendPayload = route.request().postDataJSON() as Record<string, unknown>

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      })
    })

    await page.goto("/en/signup")
    await expect(page.getByRole("heading", { name: /Check your inbox/i })).toBeVisible()
    await clickResendCode(page)

    await expect.poll(() => resendPayload).not.toBeNull()
    expect(resendPayload).toMatchObject({
      email: "john@example.com",
    })
  })

  test("phone MFA resend calls the backend with the saved phone number", async ({ page }) => {
    let resendPayload: Record<string, unknown> | null = null

    await installFastTimers(page)
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "nodiox_onboarding_draft",
        JSON.stringify({
          step: 5,
          fullName: "John Doe",
          email: "john@example.com",
          phoneNumber: "+213555123456",
        })
      )
    })

    await page.route("**/api/auth/send-otp", async (route) => {
      resendPayload = route.request().postDataJSON() as Record<string, unknown>

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      })
    })

    await page.goto("/en/signup")
    await expect(page.getByRole("heading", { name: /Check your phone/i })).toBeVisible()
    await clickResendCode(page)

    await expect.poll(() => resendPayload).not.toBeNull()
    expect(resendPayload).toMatchObject({
      phone: "+213555123456",
    })
  })

  test("password step draft restores correctly after a remount", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "nodiox_onboarding_draft",
        JSON.stringify({
          step: 6,
          fullName: "John Doe",
          email: "john@example.com",
          phoneNumber: "+213555123456",
        })
      )
    })

    await page.goto("/en/signup")
    await expect(page.getByRole("heading", { name: /Set your password/i })).toBeVisible()
    await page.reload()
    await expect(page.getByRole("heading", { name: /Set your password/i })).toBeVisible()
  })
})
