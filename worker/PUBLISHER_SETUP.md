# Page Studio secure publisher

This Worker receives a reviewed Page Studio publishing packet and performs the GitHub write server-side. The browser never receives the GitHub credential.

## Required Cloudflare setup

1. Deploy from the `worker` directory with the publisher configuration:

   ```sh
   npx wrangler deploy --config publisher-wrangler.toml
   ```

2. Store a fine-grained GitHub token as a Worker secret:

   ```sh
   npx wrangler secret put GITHUB_TOKEN --config publisher-wrangler.toml
   ```

   Limit the token to the `jaredmberger/ocean-liner-curator` repository. It needs repository Contents read/write and Pull requests read/write permissions.

3. In `publisher-wrangler.toml`, set:

   - `ALLOWED_ORIGINS` to the deployed Page Studio origins
   - `ALLOWED_REPOSITORIES` to the repositories Page Studio may modify
   - `PUBLISHER_EMAILS` to the comma-separated Cloudflare Access email addresses allowed to publish

4. Protect the publisher Worker with Cloudflare Access. The Worker requires the `Cf-Access-Authenticated-User-Email` header and rejects requests from users outside `PUBLISHER_EMAILS`.

5. Confirm `config.js` points `publisherBaseUrl` at the deployed publisher Worker.

## Publishing flow

1. Page Studio validates the repository, path, branch, commit message, page source, and page validation state.
2. The user reviews the publishing packet and explicitly confirms publication.
3. The Worker authenticates the Cloudflare Access user and validates the repository against its allowlist.
4. The Worker creates a branch from the repository default branch. If the requested branch already exists, it creates a timestamped branch instead.
5. The Worker creates or updates the requested file, creates a pull request, and returns the pull-request URL.
6. Page Studio displays a direct link to the new pull request.

## Safety boundaries

- No GitHub token is stored in browser JavaScript.
- `main` and `master` cannot be used as publishing branches.
- Repository names are restricted by `ALLOWED_REPOSITORIES`.
- Paths containing `..` or `.git/` are rejected.
- Payloads larger than 2 MB are rejected.
- Validation failures do not write to GitHub.
