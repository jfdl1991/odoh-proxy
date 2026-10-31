# Sentinel Journal

## 2026-10-31 - RFC 9230 Content-Type Validation in Cloudflare Workers ODoH Proxy
**Vulnerability:** The Oblivious DNS-over-HTTPS (ODoH) proxy accepted HTTP POST requests without verifying that the `Content-Type` was `application/oblivious-dns-message`. This allowed non-ODoH requests, unexpected payloads, or cross-origin submissions to trigger subrequests to upstream targets.
**Learning:** RFC 9230 Section 4.1 explicitly mandates that incoming client requests MUST have `Content-Type: application/oblivious-dns-message`, and that proxies MUST validate this and respond with 4xx and `Proxy-Status: ... error=http_request_error` if validation fails. In Cloudflare Workers edge environments, validating incoming request media types early acts as a crucial line of defense against cross-site request abuse, unintentional request relaying, and upstream target denial-of-service.
**Prevention:** Strictly validate incoming `Content-Type` before performing upstream routing or subrequest dispatch, returning RFC-compliant 400 responses with the standard `Proxy-Status` header when invalid.
