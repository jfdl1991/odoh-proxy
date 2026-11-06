## 2025-05-18 - URL Parameter Resolution in Cloudflare Workers
**Learning:** Sequential calls to URL parameter extraction that parse pathname segments via `pathname.split('/')` allocate multiple transient arrays and perform redundant string operations per incoming request.
**Action:** Consolidate path segment extraction into a single-pass parser function that inspects query search parameters first and only splits the pathname once if parameters are missing.
