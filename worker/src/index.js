const ALLOWED_TARGET_HOSTS = new Set([
  "oceanliners.net",
  "www.oceanliners.net",
]);

const DEFAULT_ALLOWED_ORIGINS = [
  "https://page-studio.pages.dev",
  "https://page-studio.oceanliners.net",
];

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "GET") {
      return json({ ok: false, error: "Method not allowed." }, 405, cors);
    }

    if (requestUrl.pathname === "/api/status") {
      return json(
        {
          ok: true,
          service: "Page Studio Loader",
          allowedHosts: [...ALLOWED_TARGET_HOSTS],
        },
        200,
        cors,
      );
    }

    if (requestUrl.pathname !== "/api/load") {
      return json({ ok: false, error: "Not found." }, 404, cors);
    }

    const rawTarget = requestUrl.searchParams.get("url");
    if (!rawTarget) {
      return json({ ok: false, error: "Missing url parameter." }, 400, cors);
    }

    let target;
    try {
      target = new URL(rawTarget);
    } catch {
      return json({ ok: false, error: "Invalid target URL." }, 400, cors);
    }

    const validationError = validateTarget(target);
    if (validationError) {
      return json({ ok: false, error: validationError }, 400, cors);
    }

    try {
      const upstream = await fetch(target.toString(), {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "User-Agent": "Ocean Liner Curator Page Studio Loader/1.0",
        },
        cf: {
          cacheEverything: false,
          cacheTtl: 0,
        },
      });

      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get("Location");
        if (!location) {
          return json({ ok: false, error: "Redirect response had no location." }, 502, cors);
        }

        const redirected = new URL(location, target);
        const redirectError = validateTarget(redirected);
        if (redirectError) {
          return json({ ok: false, error: "Redirect target was not allowed." }, 400, cors);
        }

        return loadHtml(redirected, cors);
      }

      return responseToJson(upstream, target, cors);
    } catch (error) {
      return json(
        {
          ok: false,
          error: "The page could not be fetched.",
          detail: error instanceof Error ? error.message : String(error),
        },
        502,
        cors,
      );
    }
  },
};

async function loadHtml(target, cors) {
  const upstream = await fetch(target.toString(), {
    redirect: "manual",
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      "User-Agent": "Ocean Liner Curator Page Studio Loader/1.0",
    },
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
  });

  if (upstream.status >= 300 && upstream.status < 400) {
    return json({ ok: false, error: "Too many redirects." }, 508, cors);
  }

  return responseToJson(upstream, target, cors);
}

async function responseToJson(upstream, target, cors) {
  const contentType = upstream.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return json(
      {
        ok: false,
        error: "The target did not return an HTML document.",
        status: upstream.status,
        contentType,
      },
      415,
      cors,
    );
  }

  const html = await upstream.text();
  return json(
    {
      ok: upstream.ok,
      url: target.toString(),
      status: upstream.status,
      contentType,
      html,
    },
    upstream.ok ? 200 : upstream.status,
    cors,
  );
}

function validateTarget(url) {
  if (url.protocol !== "https:") return "Only HTTPS target URLs are allowed.";
  if (!ALLOWED_TARGET_HOSTS.has(url.hostname.toLowerCase())) {
    return "Only OceanLiners.net pages may be loaded.";
  }
  if (url.username || url.password) return "Credentials in target URLs are not allowed.";
  return "";
}

function parseAllowedOrigins(value) {
  if (!value) return DEFAULT_ALLOWED_ORIGINS;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function corsHeaders(origin, allowedOrigins) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  });

  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

function json(payload, status, extraHeaders) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(payload), { status, headers });
}
