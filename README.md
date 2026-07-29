# Page Studio

Page Studio is the page-editing companion for the Ocean Liner Curator suite. It provides a mobile- and iPad-friendly workspace for opening an OceanLiners.net page, previewing it, editing its HTML, saving a local draft, and downloading the revised file.

## Current MVP

- Load OceanLiners.net page source through the included Cloudflare Worker
- Open a local `.html` file directly in the browser
- Live, Code, and Split views
- Desktop, tablet, and mobile preview widths
- Automatic preview refresh while editing
- Local device draft storage
- Basic HTML formatting
- Download revised HTML
- GitHub publishing fields prepared for a later authenticated backend

## Safety model

Page Studio never modifies the production website directly. Editing happens inside a sandboxed preview. The Worker only accepts HTTPS URLs on `oceanliners.net` and `www.oceanliners.net`; it is not a general-purpose proxy. Publishing remains a deliberate, separate step.

## Deploy the frontend

Serve the repository root as static files. GitHub Pages or Cloudflare Pages can publish directly from the `main` branch root.

## Deploy the Cloudflare Worker

The Worker lives in `worker/`, so a separate GitHub repository is not needed.

1. In Cloudflare, open **Workers & Pages** and choose **Create application**.
2. Import `jaredmberger/page-studio` from GitHub.
3. Set the project root directory to `worker`.
4. Use `npm run deploy` as the deploy command when Cloudflare requests one.
5. Deploy the Worker. Cloudflare will provide a URL similar to `https://page-studio-loader.<account>.workers.dev`.
6. Open `config.js` in this repository and set:

```js
window.PAGE_STUDIO_CONFIG = {
  loaderBaseUrl: "https://page-studio-loader.<account>.workers.dev",
};
```

7. Update `worker/wrangler.toml` so `ALLOWED_ORIGINS` includes the exact deployed Page Studio frontend origin. Multiple origins are comma-separated.
8. Redeploy the Worker and frontend after changing their configuration.

The Worker exposes:

- `GET /api/status`
- `GET /api/load?url=https%3A%2F%2Foceanliners.net%2Fships%2Frms-olympic`

Responses are JSON, use `Cache-Control: no-store`, validate HTML content types, and reject redirects outside the OceanLiners.net allowlist.

## Local Worker development

From the `worker` directory:

```bash
npm install
npm run dev
```

For local frontend testing, add the local frontend origin to `ALLOWED_ORIGINS` and place the local Wrangler URL in `config.js`.
