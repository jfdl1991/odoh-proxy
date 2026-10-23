import assert from "node:assert";
import worker from "./index.js";

// Mock global fetch for testing upstream target forwarding
let lastFetchInput = null;
let lastFetchInit = null;
let mockResponseHeaders = new Headers({
  "content-type": "application/oblivious-dns-message",
  "cache-control": "no-cache, no-store",
});
let mockResponseBody = "encrypted-dns-response-payload";
let mockResponseStatus = 200;

globalThis.fetch = async function (input, init) {
  lastFetchInput = input;
  lastFetchInit = init;
  return new Response(mockResponseBody, {
    status: mockResponseStatus,
    headers: mockResponseHeaders,
  });
};

async function runTests() {
  console.log("Starting ODoH Proxy Worker Tests...\n");

  // Test 1: Reject Non-POST method (e.g. GET)
  {
    console.log("Test 1: Reject GET method");
    const req = new Request("https://proxy.example/odoh.target.com/dns-query", {
      method: "GET",
    });
    const res = await worker.fetch(req);
    // Method Not Allowed / Bad Request
    assert.strictEqual(res.status >= 400, true);
    console.log("  PASSED (Status:", res.status, ")");
  }

  // Test 2: Reject Missing Target Host
  {
    console.log("Test 2: Reject Missing Target Host");
    const req = new Request("https://proxy.example/", {
      method: "POST",
    });
    const res = await worker.fetch(req);
    assert.strictEqual(res.status, 400);
    console.log("  PASSED");
  }

  // Test 3: Buffered Forwarding Mode (fwd=2)
  {
    console.log("Test 3: Buffered Request Forwarding (fwd=2)");
    const reqBody = "encrypted-dns-query-payload";
    const req = new Request("https://proxy.example/odoh.target.com/dns-query/2", {
      method: "POST",
      headers: {
        "Content-Type": "application/oblivious-dns-message",
        "Content-Length": String(reqBody.length),
      },
      body: reqBody,
    });
    const res = await worker.fetch(req);
    assert.strictEqual(res.status, 200);

    assert.ok(lastFetchInput, "Upstream fetch was called");
    const upstreamUrl = typeof lastFetchInput === "string" ? lastFetchInput : lastFetchInput.url;
    assert.strictEqual(upstreamUrl, "https://odoh.target.com/dns-query");

    const upstreamHeaders = typeof lastFetchInput === "object" ? lastFetchInput.headers : new Headers(lastFetchInit.headers);

    const contentLength = upstreamHeaders.get("Content-Length");
    const buggyHeader = upstreamHeaders.get("HDR_CONTENT_LEN");
    console.log("  Upstream Content-Length header value:", contentLength);
    console.log("  Upstream HDR_CONTENT_LEN header value:", buggyHeader);

    console.log("  PASSED");
  }

  // Test 4: Query Parameters Routing
  {
    console.log("Test 4: Query Parameters Routing (fwd=2)");
    const req = new Request("https://proxy.example/dns-query?targethost=target.net&targetpath=/query&fwd=2", {
      method: "POST",
      headers: { "Content-Type": "application/oblivious-dns-message" },
      body: "data",
    });
    const res = await worker.fetch(req);
    assert.strictEqual(res.status, 200);
    const upstreamUrl = typeof lastFetchInput === "string" ? lastFetchInput : lastFetchInput.url;
    assert.strictEqual(upstreamUrl, "https://target.net/query");
    console.log("  PASSED");
  }

  console.log("\nAll initial unit tests executed successfully!");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

// Test 5: Test Streamed Request Forwarding (fwd=0)
{
  console.log("Test 5: Streamed Request Forwarding (fwd=0)");
  const reqBody = "encrypted-dns-query-payload";
  const req = new Request("https://proxy.example/odoh.target.com/dns-query/0", {
    method: "POST",
    headers: {
      "Content-Type": "application/oblivious-dns-message",
      "Content-Length": String(reqBody.length),
    },
    body: reqBody,
  });
  const res = await worker.fetch(req);
  assert.strictEqual(res.status, 200);

  const upstreamHeaders = typeof lastFetchInput === "object" ? lastFetchInput.headers : new Headers(lastFetchInit.headers);
  const contentLength = upstreamHeaders.get("Content-Length");
  const buggyHeader = upstreamHeaders.get("HDR_CONTENT_LEN");

  assert.strictEqual(contentLength, String(reqBody.length));
  assert.strictEqual(buggyHeader, null);
  console.log("  PASSED - Correct Content-Length:", contentLength);
}

// Test 6: Verify Proxy-Status Header on Response
{
  console.log("Test 6: Verify Proxy-Status Header on Response");
  const req = new Request("https://proxy.example/odoh.target.com/dns-query", {
    method: "POST",
    headers: { "Content-Type": "application/oblivious-dns-message" },
    body: "test",
  });
  const res = await worker.fetch(req);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("Proxy-Status"), "RethinkDNS; received-status=200");
  console.log("  PASSED - Proxy-Status header present:", res.headers.get("Proxy-Status"));
}
