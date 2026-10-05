import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 12000 },
  use: {
    baseURL: "http://127.0.0.1:8117",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1050 },
      },
    },
  ],
  webServer: {
    command:
      "..\\.venv\\Scripts\\python.exe -m uvicorn workbench.api:app --host 127.0.0.1 --port 8117",
    url: "http://127.0.0.1:8117/api/health",
    reuseExistingServer: false,
    timeout: 40000,
    env: {
      MINDLAB_DATA_DIR: resolve(
        tmpdir(),
        `mindlab-workbench-e2e-${Date.now()}`,
      ),
      MINDLAB_ENABLE_REMOTE: "0",
      PYDANTIC_AI_NO_BANNER: "1",
    },
  },
});
