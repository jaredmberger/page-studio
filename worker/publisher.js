const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = splitList(env.ALLOWED_ORIGINS);
    const cors = corsHeaders(origin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST' || new URL(request.url).pathname !== '/publish') {
      return json({ error: 'Not found.' }, 404, cors);
    }

    if (allowedOrigins.length && !allowedOrigins.includes(origin)) {
      return json({ error: 'Origin is not allowed.' }, 403, cors);
    }

    const accessEmail = request.headers.get('Cf-Access-Authenticated-User-Email') || '';
    const allowedEmails = splitList(env.PUBLISHER_EMAILS).map((value) => value.toLowerCase());
    if (!accessEmail || (allowedEmails.length && !allowedEmails.includes(accessEmail.toLowerCase()))) {
      return json({ error: 'Cloudflare Access authentication is required.' }, 401, cors);
    }

    if (!env.GITHUB_TOKEN) {
      return json({ error: 'Publisher is not configured with a GitHub token.' }, 503, cors);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid JSON request.' }, 400, cors);
    }

    const validation = validatePayload(payload, env);
    if (validation.errors.length) {
      return json({ error: 'Publishing validation failed.', details: validation.errors }, 400, cors);
    }

    try {
      const result = await publishToGitHub(validation.value, env.GITHUB_TOKEN);
      return json({ ok: true, ...result }, 200, cors);
    } catch (error) {
      console.error('Page Studio publish failed', error);
      return json({ error: error.message || 'GitHub publishing failed.' }, error.status || 500, cors);
    }
  }
};

function splitList(value = '') {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function corsHeaders(origin, allowedOrigins) {
  const headers = {
    ...JSON_HEADERS,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-credentials': 'true',
    'vary': 'Origin'
  };
  if (origin && (!allowedOrigins.length || allowedOrigins.includes(origin))) {
    headers['access-control-allow-origin'] = origin;
  }
  return headers;
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function validatePayload(payload, env) {
  const errors = [];
  const repo = String(payload?.repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  const path = String(payload?.path || '').trim().replace(/^\/+/, '');
  const branch = String(payload?.branch || '').trim().replace(/^refs\/heads\//, '');
  const commit = String(payload?.commit || '').trim();
  const html = String(payload?.html || '');
  const title = String(payload?.title || commit || 'Edit page in Page Studio').trim();
  const allowedRepositories = splitList(env.ALLOWED_REPOSITORIES);

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) errors.push('Repository must use owner/name format.');
  if (allowedRepositories.length && !allowedRepositories.includes(repo)) errors.push('Repository is not on the publisher allowlist.');
  if (!path || path.includes('..') || path.startsWith('.git/') || !/\.(html?|md|css|js|json)$/i.test(path)) errors.push('File path is invalid or unsupported.');
  if (!branch || !/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes('..') || branch.endsWith('/') || ['main', 'master'].includes(branch.toLowerCase())) errors.push('Branch name is invalid or protected.');
  if (!commit || commit.length > 200) errors.push('Commit message is required and must be 200 characters or fewer.');
  if (!html.trim()) errors.push('Page source is empty.');
  if (new TextEncoder().encode(html).length > 2_000_000) errors.push('Page source exceeds the 2 MB publishing limit.');

  return { errors, value: { repo, path, branch, commit, html, title } };
}

async function publishToGitHub(input, token) {
  const { repo, path, branch, commit, html, title } = input;
  const [owner] = repo.split('/');
  const repository = await github(`/repos/${repo}`, token);
  const base = repository.default_branch;
  const baseRef = await github(`/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`, token);

  let actualBranch = branch;
  try {
    await github(`/repos/${repo}/git/refs`, token, {
      method: 'POST',
      body: { ref: `refs/heads/${actualBranch}`, sha: baseRef.object.sha }
    });
  } catch (error) {
    if (error.status !== 422) throw error;
    actualBranch = `${branch}-${Date.now().toString().slice(-8)}`;
    await github(`/repos/${repo}/git/refs`, token, {
      method: 'POST',
      body: { ref: `refs/heads/${actualBranch}`, sha: baseRef.object.sha }
    });
  }

  let existingSha;
  try {
    const current = await github(`/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(actualBranch)}`, token);
    existingSha = current.sha;
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const updateBody = {
    message: commit,
    content: toBase64(html),
    branch: actualBranch
  };
  if (existingSha) updateBody.sha = existingSha;

  const fileResult = await github(`/repos/${repo}/contents/${encodePath(path)}`, token, {
    method: 'PUT',
    body: updateBody
  });

  const existingPulls = await github(`/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${actualBranch}`)}&base=${encodeURIComponent(base)}`, token);
  let pull = existingPulls[0];
  if (!pull) {
    pull = await github(`/repos/${repo}/pulls`, token, {
      method: 'POST',
      body: {
        title,
        head: actualBranch,
        base,
        body: `Published from Page Studio.\n\nFile: \`${path}\`\nCommit: \`${fileResult.commit.sha}\``
      }
    });
  }

  return {
    repository: repo,
    file_path: path,
    branch: actualBranch,
    base_branch: base,
    commit_sha: fileResult.commit.sha,
    pull_request_number: pull.number,
    pull_request_url: pull.html_url
  };
}

async function github(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'Ocean-Liner-Curator-Page-Studio'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || `GitHub request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
