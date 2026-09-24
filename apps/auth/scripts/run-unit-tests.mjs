/* global console, process */

import { spawn } from "node:child_process"
import { readdir } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, "..")
const unitTestsDir = join(projectRoot, "src", "__tests__", "unit")

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const testFiles = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      testFiles.push(...await findTestFiles(entryPath))
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      testFiles.push(entryPath)
    }
  }

  return testFiles
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    })

    child.on("error", rejectPromise)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(
        new Error(
          signal
            ? `${command} exited due to signal ${signal}`
            : `${command} exited with code ${code ?? "unknown"}`
        )
      )
    })
  })
}

async function main() {
  const testFiles = await findTestFiles(unitTestsDir)

  if (testFiles.length === 0) {
    throw new Error("No unit tests were found in src/__tests__/unit")
  }

  await runCommand(
    process.execPath,
    [
      "--experimental-strip-types",
      "--test",
      "--experimental-test-isolation=none",
      ...testFiles.map((file) => relative(projectRoot, file)),
    ],
    { cwd: projectRoot }
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
