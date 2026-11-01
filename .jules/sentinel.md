## 2026-10-28 - Oblivious DoH Media Type Enforcement
**Vulnerability:** Oblivious DoH proxy worker accepted any POST payload regardless of the `Content-Type` header, allowing arbitrary non-ODoH payloads to be relayed through the proxy.
**Learning:** RFC 9230 Section 4.1 explicitly mandates that Clients MUST set `Content-Type: application/oblivious-dns-message`, and Proxies MUST validate that Client requests are correctly encoded and return 4xx client errors if this check fails. Without this check, proxies act as open arbitrary HTTP POST conduits rather than dedicated oblivious DNS message relays.
**Prevention:** Validate `Content-Type: application/oblivious-dns-message` on incoming requests before processing and forwarding subrequests to upstream targets.
