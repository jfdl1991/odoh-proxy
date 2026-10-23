# Changelog

All notable changes to the Oblivious DNS-over-HTTPS (ODoH) Proxy Worker will be documented in this file.

---

## [1.1.0] - Refactoring, Bug Fixes & Documentation Enhancements

### Added
* **Comprehensive `README.md` Documentation**:
  * Detailed step-by-step ODoH packet lifecycle breakdown from Client $\rightarrow$ Proxy $\rightarrow$ Target $\rightarrow$ Client.
  * Structural comparison table between standard DNS-over-HTTPS (DoH, RFC 8484) and Oblivious DoH (ODoH, RFC 9230).
  * 4-Layer Cryptographic Encapsulation Diagram (Outer TLS 1.3 Transport, HTTP Container, Inner HPKE Encryption, Raw DNS Wire Format).
  * Cloudflare Workers execution nuances explaining subrequests, memory limits, and forwarding modes (`FWD_STREAMED`, `FWD_CLONED`, `FWD_BUFFERED`).
  * Visual Mermaid sequence diagram detailing message exchanges and privacy guarantees.
* **Automated Unit Testing Suite (`test.js`)**:
  * Unit test runner testing routing formats, non-POST method rejections, missing target parameter handling, upstream header generation, and `Proxy-Status` response header compliance.
* **Inline Technical Documentation**:
  * Comprehensive JSDoc comments explaining every function's purpose, parameters, return types, and RFC 9230 compliance requirements.

### Fixed
* **Critical Header Key Bug (`HDR_CONTENT_LEN`)**:
  * **Issue**: `request()` and `bufferedRequest()` functions previously used `HDR_CONTENT_LEN: len` in the headers object literal, which produced a literal header named `"HDR_CONTENT_LEN"` instead of `"Content-Length"`.
  * **Fix**: Updated object keys to computed property name `[HDR_CONTENT_LENGTH]: len`, ensuring standard HTTP `Content-Length` header is correctly forwarded to upstream ODoH targets.
* **HTTP Method Validation Status Code**:
  * **Issue**: Incoming non-`POST` HTTP requests previously returned `HTTP 500 Internal Server Error`. RFC 9230 Section 4.1 mandates HTTP `POST` for ODoH queries.
  * **Fix**: Non-`POST` requests now return `HTTP 405 Method Not Allowed` with an `Allow: POST` header and plain text response body, accurately representing RFC compliance errors.
* **Forwarding Mode (`fwd`) Parsing Bug**:
  * **Issue**: Implicit loose equality checking (`fwd == FWD_STREAMED`) caused empty/undefined `fwd` values or non-numeric strings to trigger unexpected branch evaluations due to JavaScript type coercion (`"" == 0`).
  * **Fix**: Implemented strict integer parsing (`parseInt(fwdRaw, 10)`) with explicit default fallback to `FWD_STREAMED` (0).
* **RFC 9230 Proxy Error Headers**:
  * **Issue**: Error responses (400, 405, 500) lacked structured error content headers.
  * **Fix**: Added `Content-Type: text/plain; charset=utf-8` and `Proxy-Status: RethinkDNS; error=http_request_error` headers to all error response functions (`r400`, `r405`, `r500`).
* **Node.js Subrequest Stream Compatibility**:
  * **Issue**: When executing under Node.js / Undici runtime during local testing, body streaming threw `TypeError: RequestInit: duplex option is required when sending a body`.
  * **Fix**: Added explicit `{ duplex: "half" }` init option when running under Node.js environment while preserving native Cloudflare Workers streaming semantics.

### Changed
* Refactored `handleRequest` to streamline exception handling, ensuring all uncaught runtime exceptions safely return RFC-compliant 500 error responses with logging.
