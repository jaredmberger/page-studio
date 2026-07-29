# Page Studio

Page Studio is the iPad-friendly page editor and publishing companion for Ocean Liner Curator. It opens live OceanLiners.net pages or local HTML, supports visual and code editing, validates the result, and can send a reviewed edit to GitHub through a secure Cloudflare Worker.

## Current workflow

- Load OceanLiners.net page source through the included Worker
- Open local `.html` files
- Live, Code, and Split views
- Desktop, tablet, and mobile previews
- Direct element editing plus Undo, Redo, and Restore Original
- Validation, internal-link suggestions, drafts, and HTML download
- Publishing review followed by branch, commit, and pull-request creation

## Safety model

Page Studio never writes directly to the production branch. Editing happens inside a sandboxed preview. Publishing requires explicit confirmation and always targets a non-protected branch. The browser never receives or stores the GitHub credential; the Worker reads it from the encrypted `GITHUB_TOKEN` secret.

The Worker also restricts publishing to `ALLOWED_REPOSITORY` and rejects requests from origins not listed in `ALLOWED_ORIGINS`.

## Deploy the frontend

Serve the repository root as static files. GitHub Pages or Cloudflare Pages can publish directly from `main`.

`config.js` should point both services to the deployed Worker:

```js
window.PAGE_STUDIO_CONFIG = {
  loaderBaseUrl: "https://page-studio-loader.<account>.workers.dev",
  publisherBaseUrl: "https://page-studio-loader.<account>.workers.dev",
};
```

## Deploy the Cloudflare Worker

The Worker lives in `worker/`.

1. In Cloudflare, open **Workers & Pages** and import `jaredmberger/page-studio`.
2. Set the project root directory to `worker`.
3. Use `npm run deploy` as the deploy command.
4. Confirm these `worker/wrangler.toml` values:
   - `ALLOWED_ORIGINS` contains the exact Page Studio frontend origin.
   - `ALLOWED_REPOSITORY` is `jaredmberger/ocean-liner-curator`.
   - `GITHUB_BASE_BRANCH` is `main`.
5. Add the encrypted Worker secret from Cloudflare or Wrangler:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Use a fine-grained GitHub token limited to `jaredmberger/ocean-liner-curator` with:

- **Contents: Read and write**
- **Pull requests: Read and write**
- **Metadata: Read**

Do not put the token in `wrangler.toml`, `config.js`, GitHub, or browser storage.

6. Redeploy the Worker and frontend.

For another authentication boundary, place the Worker behind Cloudflare Access. The frontend already sends requests with credentials enabled.

## Worker endpoints

- `GET /api/status`
- `GET /api/load?url=https%3A%2F%2Foceanliners.net%2Fships%2Frms-olympic`
- `POST /publish`
- `POST /api/publish`

The publishing endpoint validates the repository, path, branch, commit message, pull-request title, HTML payload, request origin, and payload size before contacting GitHub. It creates the branch when needed, creates or updates the file, opens a pull request, and returns its URL. Existing open pull requests for the same branch are reused.

## Local Worker development

From `worker/`:

```bash
npm install
npm run dev
```

Add the local frontend origin to `ALLOWED_ORIGINS`. Local publishing still requires a `GITHUB_TOKEN` secret and should use a disposable test branch.
