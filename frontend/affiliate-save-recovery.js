(() => {
  const API = '/api/v1';
  const token = () => localStorage.getItem('mlai_token') || '';
  const headers = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) });
  const json = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(body?.message || body?.error || `HTTP_${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  };

  async function pending() {
    return json(`${API}/products/affiliate-pending`, { method: 'GET' });
  }

  async function saveAffiliateLink(productId, affiliateUrl) {
    let firstError = null;
    try {
      return await json(`${API}/products/${encodeURIComponent(productId)}/affiliate-link`, {
        method: 'POST',
        body: JSON.stringify({ affiliateUrl })
      });
    } catch (error) {
      firstError = error;
    }

    // Some older records are addressed by Mercado Livre item ID rather than
    // the internal database ID. Retry using the current pending record.
    try {
      const list = await pending();
      const product = (Array.isArray(list) ? list : []).find(item => String(item.id) === String(productId));
      if (product?.externalProductId) {
        return await json(`${API}/products/by-item/${encodeURIComponent(product.externalProductId)}/affiliate-link`, {
          method: 'POST',
          body: JSON.stringify({ affiliateUrl })
        });
      }
    } catch {}

    // The database update can succeed before the marketing-queue step fails.
    // In that case the product disappears from the pending list and must be
    // treated as saved instead of showing a false error to the user.
    try {
      const list = await pending();
      const stillPending = (Array.isArray(list) ? list : []).some(item => String(item.id) === String(productId));
      if (!stillPending) return { affiliateStatus: 'ACTIVE', marketing: 'PENDING_RETRY', storefront: 'ACTIVE' };
    } catch {}

    throw firstError || new Error('AFFILIATE_LINK_SAVE_FAILED');
  }

  document.addEventListener('click', event => {
    const addButton = event.target.closest?.('[data-add-link]');
    if (addButton) window.__orusAffiliateProductId = addButton.getAttribute('data-add-link') || '';

    const saveButton = event.target.closest?.('#affiliateFlowSave');
    if (!saveButton) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const input = document.getElementById('affiliateFlowInput');
    const status = document.getElementById('affiliateFlowStatus');
    const productId = window.__orusAffiliateProductId || '';
    const affiliateUrl = input?.value?.trim() || '';
    if (!/^https:\/\/meli\.la\/[A-Za-z0-9_-]+(?:\?.*)?$/i.test(affiliateUrl)) {
      if (status) status.textContent = '❌ Cole o link oficial https://meli.la/... correspondente a ESTE produto.';
      return;
    }
    if (!productId) {
      if (status) status.textContent = '❌ Não foi possível identificar este produto. Feche e abra o cartão novamente.';
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';
    if (status) status.textContent = 'Salvando o link e ativando o produto na loja do Orus...';
    saveAffiliateLink(productId, affiliateUrl).then(() => {
      if (status) status.textContent = '✅ Link salvo. Produto liberado e encaminhado para a loja do Orus.';
      saveButton.textContent = '✓ Liberado';
      setTimeout(() => {
        document.getElementById('affiliateFlowModal')?.remove();
        if (typeof window.__hunterLoad === 'function') window.__hunterLoad();
      }, 700);
    }).catch(error => {
      saveButton.disabled = false;
      saveButton.textContent = '✓ Salvar e liberar';
      if (status) status.textContent = `❌ Não foi possível salvar o link (${error?.message || 'erro do servidor'}).`;
    });
  }, true);
})();
