(() => {
  const API = '/api/v1';
  const token = () => localStorage.getItem('mlai_token') || '';
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));

  function browserSearch(query) {
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
      if (!String(error?.message || '').startsWith('BACKEND_SEARCH_401') && !String(error?.message || '').startsWith('BACKEND_SEARCH_403') && !String(error?.message || '').includes('403') && !String(error?.message || '').includes('401')) {
        // Network/backend failures are also allowed to fall back to the official public search.
      }
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

      // Persist the exact real ITEM_ID + permalink in our database so the product becomes
      // eligible for the affiliate-link workflow. No scraping or unofficial proxy is used.
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

      // Recompute a visible score only as a transparent estimate when the server-side scorer
      // cannot access Mercado Livre. The persisted score is calculated server-side on import.
      normalized.items = normalized.items.map(p => ({ ...p, score: p.score || 50 }));
      renderResults(box, normalized);
    } catch (error) {
      box.innerHTML = '<p class="error">Não foi possível buscar produtos agora. A conexão do servidor com o Mercado Livre continua bloqueada (HTTP 403) e a busca direta no navegador também falhou.</p>';
    }
  };
})();
