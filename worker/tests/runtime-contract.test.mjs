import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

test("Page Studio loader exposes runtime contract v1", async () => {
  const response = await worker.fetch(
    new Request("https://page-studio-loader.test/api/runtime"),
    {
      CF_VERSION_METADATA: {
        id: "cf-version-456",
        tag: "production",
        timestamp: "2026-09-29T00:00:00.000Z"
      }
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.contractVersion, 1);
  assert.equal(body.service, "Page Studio Loader");
  assert.equal(body.repository, "jaredmberger/page-studio");
  assert.equal(body.productionBranch, "main");
  assert.equal(body.version, "1.0.0");
  assert.equal(typeof body.commit, "string");
  assert.equal(body.cloudflareDeploymentId, "cf-version-456");
  assert.equal(body.runtime, "cloudflare-workers");
  assert.equal(body.cloudflareVersion.id, "cf-version-456");
  assert.match(body.observedAt, /^\d{4}-\d{2}-\d{2}T/);
});
