// SPDX-License-Identifier: 0BSD

/**
 * Oblivious DNS-over-HTTPS (ODoH) Proxy for Cloudflare Workers
 * Compliant with RFC 9230 (https://datatracker.ietf.org/doc/rfc9230/)
 *
 * An Oblivious Proxy relays encrypted ODoH messages between an Oblivious Client
 * and an Oblivious Target. The Proxy sees the client's IP address but cannot
 * read the encrypted query payload (which is encrypted using the Target's HPKE public key).
 */

const FWD = "fwd";
const FWD_STREAMED = 0; // default
const FWD_BUFFERED = 2;
const FWD_CLONED = 1;
const HDR_CONTENT_LENGTH = "Content-Length";
const ODOH_METHOD = "POST";
const ODOH_TARGETHOST = "targethost";
const ODOH_TARGETPATH = "targetpath";
const ODOH_ENDPOINT_NAME = "RethinkDNS";

const ODOH_HDR_ACCEPT = { Accept: "application/oblivious-dns-message" };
const ODOH_HDR_CONTENT_TYPE = {
  "Content-Type": "application/oblivious-dns-message",
};
const ODOH_HDR_CACHE_CONTROL = { "Cache-Control": "no-cache, no-store" };

// datatracker.ietf.org/doc/rfc9230/ (section 4.1)
const ODOH_HDR_PROXY_ERR = {
  "Proxy-Status": ODOH_ENDPOINT_NAME + "; error=http_request_error",
  "Content-Type": "text/plain; charset=utf-8",
};

/**
 * Builds standard Proxy-Status header object according to RFC 9230.
 * @param {number} code - HTTP status code received from downstream target
 * @returns {Record<string, string>}
 */
function proxyStatusHdr(code) {
  return { "Proxy-Status": `${ODOH_ENDPOINT_NAME}; received-status=${code}` };
}

/**
 * Builds key-value pair representation of Proxy-Status header.
 * @param {number} code - HTTP status code received from downstream target
 * @returns {{ k: string, v: string }}
 */
function proxyStatusKV(code) {
  return {
    k: "Proxy-Status",
    v: `${ODOH_ENDPOINT_NAME}; received-status=${code}`,
  };
}

/**
 * Constructs an HTTP 500 Internal Server Error response.
 * Returned on unexpected runtime failures or unhandled subrequest exceptions.
 * @param {string} txt - Descriptive error message
 * @returns {Response}
 */
function r500(txt) {
  return new Response(txt, {
    status: 500,
    statusText: "Internal Server Error",
    headers: { ...ODOH_HDR_PROXY_ERR },
  });
}

/**
 * Constructs an HTTP 400 Bad Request error response.
 * Returned when mandatory target parameters (targethost/targetpath) are missing or malformed.
 * @param {string} txt - Descriptive error message
 * @returns {Response}
 */
function r400(txt) {
  return new Response(txt, {
    status: 400,
    statusText: "Bad Request",
    headers: { ...ODOH_HDR_PROXY_ERR },
  });
}

/**
 * Constructs an HTTP 405 Method Not Allowed error response.
 * RFC 9230 Section 4.1 mandates HTTP POST for ODoH requests.
 * @param {string} txt - Descriptive error message
 * @returns {Response}
 */
function r405(txt) {
  return new Response(txt, {
    status: 405,
    statusText: "Method Not Allowed",
    headers: {
      ...ODOH_HDR_PROXY_ERR,
      Allow: ODOH_METHOD,
    },
  });
}

/**
 * Formats response from downstream target to client, capturing upstream headers
 * into debug `x-*` response headers.
 * Note: Renames headers as Cloudflare Snippets snips some out (like the "Location" header).
 *
 * @param {Response} r - Downstream Target Response
 * @param {Request} fwdreq - Upstream Subrequest sent to target
 * @returns {Response}
 */
function response(r, fwdreq) {
  // rename the headers as Snippets snips some out (like the "Location" header)
  const orighdrs = {};
  let h = 0;
  let f = 0;
  for (const [k, v] of r.headers) {
    orighdrs[`x-${k}`] = v;
    h++;
  }
  for (const [k, v] of fwdreq.headers) {
    orighdrs[`x-fwdreq-${k}`] = v;
    f++;
  }
  orighdrs["x-orig-hdr-count"] = h + "";
  orighdrs["x-fwdreq-hdr-count"] = f + "";
  return new Response(r.body, {
    status: r.status,
    statusText: r.statusText,
    headers: {
      ...orighdrs,
      ...ODOH_HDR_CONTENT_TYPE,
      ...proxyStatusHdr(r.status),
    },
  });
}

/**
 * Builds a clean upstream Request for ODoH proxying (Mode 0: Streaming).
 * Strips client-identifying headers to preserve client anonymity as mandated by RFC 9230 section 4.1.
 *
 * @param {URL|string} u - Upstream Target URL
 * @param {Request} r - Original incoming Client Request
 * @returns {Request}
 */
function request(u, r) {
  const len = hdr(r.headers, HDR_CONTENT_LENGTH, "0");
  const init = {
    method: ODOH_METHOD,
    body: r.body,
    headers: {
      ...ODOH_HDR_CONTENT_TYPE,
      ...ODOH_HDR_CACHE_CONTROL,
      ...ODOH_HDR_ACCEPT,
      [HDR_CONTENT_LENGTH]: len,
    },
  };

  // Node.js / Undici runtime compatibility for Request body streaming during local testing
  if (r.body && typeof process !== "undefined" && process.versions?.node) {
    init.duplex = "half";
  }

  return new Request(u, init);
}

/**
 * Builds a cloned upstream Request for ODoH proxying (Mode 1: Cloned).
 * Note: Used to follow redirects (see stackoverflow.com/questions/55920957).
 *
 * @param {URL|string} u - Upstream Target URL
 * @param {Request} r - Original incoming Client Request
 * @returns {Request}
 */
function clonedRequest(u, r) {
  // to follow redirects
  // stackoverflow.com/questions/55920957
  return new Request(u, r);
}

/**
 * Builds a buffered upstream Request for ODoH proxying (Mode 2: Buffered).
 * Reads full request body into ArrayBuffer prior to subrequest dispatch.
 * Note: Used to follow redirects (see stackoverflow.com/questions/55920957).
 *
 * @param {URL|string} u - Upstream Target URL
 * @param {ArrayBuffer} body - Buffered body contents
 * @returns {Request}
 */
function bufferedRequest(u, body) {
  let len = "0";
  if (body) {
    len = body.byteLength + "";
  }
  // to follow redirects
  // stackoverflow.com/questions/55920957
  return new Request(u, {
    method: ODOH_METHOD,
    body: body,
    headers: {
      ...ODOH_HDR_CONTENT_TYPE,
      ...ODOH_HDR_CACHE_CONTROL,
      ...ODOH_HDR_ACCEPT,
      [HDR_CONTENT_LENGTH]: len,
    },
  });
}

/**
 * Constructs proxy response by copying downstream response and appending Proxy-Status header.
 * @param {Response} r - Downstream Target Response
 * @param {Request} fwdreq - Upstream Subrequest sent to target
 * @returns {Response}
 */
function cloneResponse(r, fwdreq) {
  const rr = new Response(r.body, r);
  const pkv = proxyStatusKV(r.status);
  rr.headers.set(pkv.k, pkv.v);
  for (const [k, v] of fwdreq.headers) {
    rr.headers.set(`x-fwdreq-${k}`, v);
  }
  return rr;
}

/**
 * Safely extracts header value case-insensitively from Headers instance.
 * @param {Headers} h - Request/Response Headers instance
 * @param {string} k - Header key
 * @param {string} d - Default fallback value
 * @returns {string}
 */
function hdr(h, k, d) {
  if (!h || !k || typeof h.get !== "function") {
    return d;
  }
  return h.get(k) || d;
}

/**
 * Extracts URL search query parameter value.
 * @param {URL} url - Request URL object
 * @param {string} name - Search parameter name
 * @returns {string}
 */
function param(url, name) {
  if (!url || !name) {
    return "";
  }
  return url.searchParams.get(name) || "";
}

/**
 * Extracts path segment from URL according to index mapping:
 * - Segment 1: targethost
 * - Segment 2: targetpath
 * - Segment 3: fwd mode
 *
 * @param {URL} url - Request URL object
 * @param {string} name - Parameter identifier
 * @returns {string}
 */
function at(url, name) {
  if (!url || !name) {
    return "";
  }

  const path = url.pathname;
  if (!path || path === "/") {
    return "";
  }
  const p = path.split("/");
  let i = Number.MAX_SAFE_INTEGER;
  if (name === ODOH_TARGETHOST) {
    i = 1;
  } else if (name === ODOH_TARGETPATH) {
    i = 2;
  } else if (name === FWD) {
    i = 3;
  }
  if (p.length > i) {
    return p[i];
  }
  return "";
}

/**
 * Retrieves setting value checking search parameters first, then path segments.
 * @param {URL} url - Request URL object
 * @param {string} name - Parameter identifier
 * @returns {string}
 */
function get(url, name) {
  return param(url, name) || at(url, name);
}

/**
 * Ensures path string begins with leading slash (`/`).
 * @param {string} path - Input path string
 * @returns {string}
 */
function ensureLeadingSlash(path) {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Proxy the ODoH request to the target host/path and return the response.
 * Handles request validation, target routing, subrequest forwarding, and response delivery.
 *
 * @param {Request} req - Incoming HTTP Request from Oblivious Client
 * @returns {Promise<Response>}
 */
async function handleRequest(req) {
  try {
    // https://odoh.proxy/dns-query?targethost=&targetpath=
    // https://odoh.proxy/{targethost}/{targetpath}
    const u = new URL(req.url);

    // Validate HTTP Method (RFC 9230 Section 4.1 requires HTTP POST)
    if (req.method !== ODOH_METHOD) {
      return r405(`Method Not Allowed: Only ${ODOH_METHOD} is supported for ODoH requests.`);
    }

    const host = get(u, ODOH_TARGETHOST);
    const path0 = get(u, ODOH_TARGETPATH);
    const fwdRaw = get(u, FWD);

    if (!host) {
      return r400(`Missing required parameter: ${ODOH_TARGETHOST}`);
    }
    if (!path0) {
      return r400(`Missing required parameter: ${ODOH_TARGETPATH}`);
    }

    // Parse forwarding mode integer (default: 0 - FWD_STREAMED)
    let fwdMode = FWD_STREAMED;
    if (fwdRaw !== "") {
      const parsed = parseInt(fwdRaw, 10);
      if (!isNaN(parsed)) {
        fwdMode = parsed;
      }
    }

    // ensure targetPath starts with a slash
    const path = ensureLeadingSlash(path0);

    const target = `https://${host}${path}`;

    if (fwdMode === FWD_BUFFERED) {
      // == string or number
      // if redirected by the target:
      // with "fetch(bufferedRequest())" => 1022 Snippets exceeded subrequests limit
      const body = await req.arrayBuffer();
      const fwdreq = bufferedRequest(target, body);
      const downstream = await fetch(fwdreq);
      return cloneResponse(downstream, fwdreq);
    } else if (fwdMode === FWD_CLONED) {
      // if redirected by the target:
      // with "return cloneResponse()" => 405 Method Not Allowed
      // with "return response()" => 301 Moved Permanently
      const fwdreq = clonedRequest(target, req);
      const downstream = await fetch(fwdreq);
      return response(downstream, fwdreq);
    } else {
      // fwd == FWD_STREAMED
      // if redirected by the target:
      // with "return clonedResponse()" => 500 Internal Server Error
      const fwdreq = request(target, req);
      const downstream = await fetch(fwdreq);
      return cloneResponse(downstream, fwdreq);
    }
  } catch (err) {
    console.error("ODoH Proxy handleRequest Exception:", err);
    return r500(err.message || "Internal Server Error");
  }
}

// developers.cloudflare.com/workers/runtime-apis/fetch-event/#syntax-module-worker
export default {
  async fetch(r, env, ctx) {
    return handleRequest(r);
  },
};
