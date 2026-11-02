## 2026-10-28 - Redundant Path Splitting in Worker Routing
**Learning:** In Cloudflare Workers request handlers, repeated calls to extract routing parameters from `pathname` cause redundant string allocations and `.split('/')` operations per request, significantly increasing GC pressure and routing overhead.
**Action:** Extract routing path segments and query parameters in a single pass instead of querying each parameter individually.
