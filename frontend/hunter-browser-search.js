(() => {
  const API = '/api/v1';
  const token = () => localStorage.getItem('mlai_token') || '';
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));

  async function browserFetchSearch(query) {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=20`;
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`MERCADO_LIVRE_BROWSER_HTTP_${response.status}`);
    return response.json();
  }

  function browserJsonpSearch(query) {
    return new Promise((resolve, reject) => {
      const callback = `__mlaiSearch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const cleanup = () => { try { delete window[callback]; } catch {} script.remove(); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('MERCADO_LIVRE_BROWSER_SEARCH_TIMEOUT')); }, 12000);
      window[callback] = payload => { clearTimeout(timer); cleanup(); resolve(payload || {}); };
      script.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error('MERCADO_LIVRE_BROWSER_SEARCH_FAILED')); };
      script.src = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=20&callback=${encodeURIComponent(callback)}`;
      document.head.appendChild(script);
    });
  }

  async function browserSearch(query) {
    // Prefer normal browser CORS. JSONP is only a compatibility fallback for
    // older/public configurations; the normal endpoint is the official API.
    try {
      return await browserFetchSearch(query);
    } catch (corsError) {
      try {
        return await browserJsonpSearch(query);
      } catch (jsonpError) {
        const detail = String(corsError?.message || jsonpError?.message || 'UNKNOWN');
        throw new Error(`MERCADO_LIVRE_BROWSER_SEARCH_FAILED:${detail}`);
      }
    }
  }

  function renderResults(box, data) {
    const items = data.items || [];
    box.innerHTML = items.map(p => productCard(p)).join('') || '<p class="muted">Nenhum produto encontrado.</p>';
  }

  window.searchProducts = async function() {
    const input = document.getElementById('productQuery');
    const box = document.getElementById('results');
    const q = input?.value?.trim() || '';
    if (!q || !box) return;
    box.innerHTML = '<p class="muted">Buscando produtos reais...</p>';

    try {
      const response = await fetch(`${API}/products/search?q=${encodeURIComponent(q)}`, {
        headers: token() ? { Authorization: 'Bearer ' + token() } : {}
      });
      if (response.ok) {
        const data = await response.json();
        renderResults(box, data);
        return;
      }
      if (![401, 403].includes(response.status)) throw new Error(`BACKEND_SEARCH_${response.status}`);
    } catch (error) {
      // The official browser-side search below is the recovery path when the
      // Render server cannot reach Mercado Livre because of its outbound IP.
    }

    box.innerHTML = '<p class="muted">O servidor está bloqueado para a busca pública. Fazendo a mesma busca diretamente no navegador pelo endpoint oficial...</p>';
    try {
      const raw = await browserSearch(q);
      const normalized = {
        query: raw.query || q,
        total: Number(raw?.paging?.total || 0),
        items: (raw.results || []).map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          originalPrice: p.original_price ?? null,
          discountPercent: p.original_price && p.price ? Math.max(0, ((Number(p.original_price) - Number(p.price)) / Number(p.original_price)) * 100) : 0,
          rating: p.reviews?.rating_average ?? null,
          reviewsCount: p.reviews?.total ?? 0,
          soldQuantity: p.sold_quantity ?? null,
          thumbnail: p.thumbnail,
          permalink: p.permalink,
          score: 0,
          dataQuality: { demand: p.sold_quantity != null ? 'REAL' : 'LIMITED', conversion: 'NOT_AVAILABLE', commission: 'LINK_REQUIRED' }
        }))
      };

      if (token() && normalized.items.length) {
        try {
          const imported = await fetch(`${API}/products/browser-search-import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
            body: JSON.stringify({ results: raw.results || [] })
          });
          if (imported.ok) {
            const saved = await imported.json();
            normalized.items = (saved.items || normalized.items).map(p => ({ ...p, permalink: p.permalink || p.productUrl, affiliateStatus: p.affiliateStatus || 'PENDING' }));
          }
        } catch {}
      }

      normalized.items = normalized.items.map(p => ({ ...p, score: p.score || 50 }));
      renderResults(box, normalized);
    } catch (error) {
      const reason = String(error?.message || 'UNKNOWN');
      console.error('[Orus] Mercado Livre browser search failed', reason);
      box.innerHTML = '<p class="error">A busca do Mercado Livre foi recusada no servidor e o navegador também não conseguiu acessar a API oficial. Nenhum produto foi inventado ou salvo como válido.</p>';
    }
  };
})();
