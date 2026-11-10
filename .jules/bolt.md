## 2025-05-18 - Fast-path Header Allocations and Status Caching
**Learning:** In a high-throughput Cloudflare Worker proxying ODoH requests, constructing object spreads for static headers (`Content-Type`, `Cache-Control`, `Accept`) and repeatedly allocating string interpolations for common downstream HTTP statuses (like HTTP 200) creates GC pressure on every request.
**Action:** Pre-merge static base headers and cache the frequent HTTP 200 Proxy-Status key-value object to reduce per-request allocations.
