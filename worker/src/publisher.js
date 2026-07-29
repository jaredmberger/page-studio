const GITHUB_API = "https://api.github.com";
const MAX_HTML_BYTES = 2_500_000;

export async function publishToGitHub(request, env, cors) {
  if (!env.GITHUB_TOKEN) {
    return json({ ok: false, error: "GitHub publishing is not configured on the Worker." }, 503, cors);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Request body must be valid JSON." }, 400, cors);
  }

  const validation = validatePayload(payload, env);
  if (validation.errors.length) {
    return json({ ok: false, error: "Publishing validation failed.", details: validation.errors }, 400, cors);
  }

  const { owner, repository, repo, path, branch, commit, title, html } = validation;

  try {
    const repoInfo = await github(env, `/repos/${owner}/${repository}`);
    const baseBranch = env.GITHUB_BASE_BRANCH || repoInfo.default_branch || "main";
    const baseRef = await github(env, `/repos/${owner}/${repository}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
    const baseSha = baseRef.object.sha;

    let branchExists = true;
    try {
      await github(env, `/repos/${owner}/${repository}/git/ref/heads/${encodeURIComponent(branch)}`);
    } catch (error) {
      if (error.status !== 404) throw error;
      branchExists = false;
      await github(env, `/repos/${owner}/${repository}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      });
    }

    let existingFile = null;
    try {
      existingFile = await github(env, `/repos/${owner}/${repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    const fileResponse = await github(env, `/repos/${owner}/${repository}/contents/${encodePath(path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message: commit,
        content: utf8ToBase64(html),
        branch,
        ...(existingFile?.sha ? { sha: existingFile.sha } : {}),
      }),
    });

    let pullRequest;
    const existingPulls = await github(
      env,
      `/repos/${owner}/${repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&base=${encodeURIComponent(baseBranch)}`,
    );

    if (Array.isArray(existingPulls) && existingPulls.length) {
      pullRequest = existingPulls[0];
    } else {
      pullRequest = await github(env, `/repos/${owner}/${repository}/pulls`, {
        method: "POST",
        body: JSON.stringify({
          title,
          head: branch,
          base: baseBranch,
          body: buildPullRequestBody(path, commit),
          maintainer_can_modify: true,
        }),
      });
    }

    return json(
      {
        ok: true,
        repository: repo,
        file_path: path,
        branch,
        base_branch: baseBranch,
        branch_created: !branchExists,
        file_action: existingFile ? "updated" : "created",
        commit_sha: fileResponse.commit?.sha || "",
        pull_request_number: pullRequest.number,
        pull_request_url: pullRequest.html_url,
      },
      200,
      cors,
    );
  } catch (error) {
    return json(
      {
        ok: false,
        error: humanizeGitHubError(error),
        github_status: error.status || null,
      },
      error.status && error.status < 500 ? error.status : 502,
      cors,
    );
  }
}

function validatePayload(payload, env) {
  const errors = [];
  const repo = String(payload?.repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  const path = String(payload?.path || "").trim().replace(/^\/+/, "");
  const branch = String(payload?.branch || "").trim().replace(/^refs\/heads\//, "");
  const commit = String(payload?.commit || "").trim();
  const title = String(payload?.title || commit || "Page Studio edit").trim();
  const html = String(payload?.html || "");
  const [owner = "", repository = ""] = repo.split("/");

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) errors.push("Repository must use owner/name format.");
  if (env.ALLOWED_REPOSITORY && repo.toLowerCase() !== env.ALLOWED_REPOSITORY.toLowerCase()) errors.push("That repository is not allowed by this Worker.");
  if (!path || path.includes("..") || path.startsWith(".") || !/\.(html?|md|css|js|json)$/i.test(path)) errors.push("File path is invalid or unsupported.");
  if (!branch || branch.length > 100 || !/^[A-Za-z0-9._\/-]+$/.test(branch) || branch.includes("..") || branch.endsWith("/") || branch.startsWith("/")) errors.push("Branch name is invalid.");
  const protectedBranches = new Set(["main", "master", String(env.GITHUB_BASE_BRANCH || "").toLowerCase()].filter(Boolean));
  if (protectedBranches.has(branch.toLowerCase())) errors.push("Publishing directly to the protected base branch is not allowed.");
  if (!commit || commit.length > 200) errors.push("Commit message is required and must be 200 characters or fewer.");
  if (!title || title.length > 240) errors.push("Pull request title is required and must be 240 characters or fewer.");
  if (!html.trim()) errors.push("HTML source is empty.");
  if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) errors.push("HTML source exceeds the Worker size limit.");

  return { errors, owner, repository, repo, path, branch, commit, title, html };
}

async function github(env, path, options = {}) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Ocean-Liner-Curator-Page-Studio-Publisher/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `GitHub API request failed with status ${response.status}.`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function buildPullRequestBody(path, commit) {
  return [
    "Page Studio publishing request.",
    "",
    `- File: \`${path}\``,
    `- Commit: ${commit}`,
    "- Source: Ocean Liner Curator Page Studio",
    "",
    "Review the rendered page and diff before merging.",
  ].join("\n");
}

function humanizeGitHubError(error) {
  if (error.status === 401) return "GitHub rejected the Worker credentials. Update the GITHUB_TOKEN secret.";
  if (error.status === 403) return "GitHub denied this publishing action. Check token permissions and repository access.";
  if (error.status === 404) return "The repository, branch, or file could not be found with the current GitHub credentials.";
  if (error.status === 409) return "GitHub reported a branch or file conflict. Try a new branch name and publish again.";
  if (error.status === 422) return error.data?.message || "GitHub rejected the branch, file update, or pull request as invalid.";
  return error instanceof Error ? error.message : "The GitHub publishing request failed.";
}

function json(payload, status, extraHeaders) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers });
}
