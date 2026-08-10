(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  if (params.get('source') !== 'content-opportunity') return;

  const opportunityId = String(params.get('opportunity_id') || '').trim();
  if (!opportunityId) return;

  const opportunityType = String(params.get('opportunity_type') || '').trim().toLowerCase();
  const existingNotes = String(params.get('notes') || '').trim();
  const canonicalUrl = String(params.get('url') || '').trim();
  const workflowEndpoint = `https://content.oceanliners.net/api/workflow/${encodeURIComponent(opportunityId)}`;
  const nativeFetch = window.fetch.bind(window);
  let syncing = false;

  function isPageStudioPublish(url, init = {}) {
    if (String(init.method || 'GET').toUpperCase() !== 'POST') return false;
    try {
      const parsed = new URL(typeof url === 'string' ? url : url.url, location.href);
      const publisher = window.PAGE_STUDIO_CONFIG?.publisherBaseUrl;
      if (!publisher) return parsed.pathname === '/publish';
      const expected = new URL(publisher, location.href);
      return parsed.origin === expected.origin && parsed.pathname === '/publish';
    } catch {
      return false;
    }
  }

  function receiptNotes(data) {
    const lines = [];
    if (existingNotes) lines.push(existingNotes, '');
    lines.push(
      '--- Page Studio production receipt ---',
      `Status: Pull request created`,
      `Opportunity: ${opportunityId}`,
      opportunityType ? `Opportunity type: ${opportunityType}` : '',
      canonicalUrl ? `Canonical target: ${canonicalUrl}` : '',
      data.repository ? `Repository: ${data.repository}` : '',
      data.file_path ? `File path: ${data.file_path}` : '',
      data.branch ? `Branch: ${data.branch}` : '',
      data.pull_request_number ? `Pull request: #${data.pull_request_number}` : '',
      data.pull_request_url ? `Pull request URL: ${data.pull_request_url}` : '',
      `Created: ${new Date().toISOString()}`
    );
    return lines.filter(Boolean).join('\n').slice(0, 5000);
  }

  async function syncOpportunity(data) {
    if (syncing) return;
    syncing = true;
    try {
      const response = await nativeFetch(workflowEndpoint, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          workflowStatus: 'in-progress',
          notes: receiptNotes(data)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${response.status}`);

      window.__PAGE_STUDIO_OPPORTUNITY_SYNC__ = {
        ok: true,
        opportunityId,
        workflowStatus: 'in-progress',
        pullRequestUrl: data.pull_request_url || '',
        syncedAt: new Date().toISOString()
      };

      const result = document.querySelector('[data-publish-result]');
      if (result && !result.querySelector('[data-opportunity-sync-status]')) {
        const note = document.createElement('span');
        note.dataset.opportunitySyncStatus = 'true';
        note.textContent = 'Content Opportunity updated · In Progress';
        result.appendChild(note);
      }
    } catch (error) {
      console.warn('[Page Studio] Content Opportunity workflow sync failed', error);
      window.__PAGE_STUDIO_OPPORTUNITY_SYNC__ = { ok: false, opportunityId, error: error?.message || String(error) };
    } finally {
      syncing = false;
    }
  }

  window.fetch = async function(input, init) {
    const response = await nativeFetch(input, init);
    if (!isPageStudioPublish(input, init) || !response.ok) return response;

    try {
      const data = await response.clone().json();
      if (data?.pull_request_url && data?.pull_request_number) queueMicrotask(() => syncOpportunity(data));
    } catch (error) {
      console.warn('[Page Studio] unable to inspect publish receipt for opportunity sync', error);
    }
    return response;
  };
})();
