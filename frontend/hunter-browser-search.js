(() => {
  const API = '/api/v1';
  const token = () => localStorage.getItem('mlai_token') || '';
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));

  function productCard(p) {
    const id = esc(p.id || p.externalProductId || '');
    const url = esc(p.permalink || p.productUrl || '');
    const image = esc(p.thumbnail || p.imageUrl || '');
    const price = Number(p.price);
    const priceText = Number.isFinite(price) && price > 0 ? `R$ ${price.toFixed(2).replace('.', ',')}` : 'Preço não informado';
    const discount = Number(p.discountPercent) > 0 ? ` · ${Number(p.discountPercent).toFixed(0)}% desconto` : '';
    const sold = p.soldQuantity != null ? ` · ${Number(p.soldQuantity)} vendidos` : '';
    return `<article class="card product" data-external-product-id="${id}" data-product-id="${id}" style="margin-top:10px"><div class="product-row">${image ? `<a href="${url}" target="_blank" rel="noopener"><img class="product-img" src="${image}" alt="${esc(p.title || 'Produto')}" loading="lazy" onerror="this.style.display='none'"></a>` : ''}<div class="product-main" style="min-width:0;flex:1"><strong>${esc(p.title || 'Produto real do Mercado Livre')}</strong><div class="muted">${priceText}${discount}${sold}</div><div class="muted small">🟡 Link de afiliado necessário</div></div><div class="score-pill">${Number(p.score || 0)}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><a class="btn alt" href="${url}" target="_blank" rel="noopener">🛒 Abrir ESTE produto no Mercado Livre</a></div></article>`;
  }

  async function browserFetchSearch(query) {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=20`;
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`MERCADO_LIVRE_BROWSER_HTTP_${response.status}`);
    return response.json();
  }

  function browserJsonpSearch(query) {
    return new Promise((resolve, reject) => {
      const callback = `__mlaiSearch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const cleanup = () => { try { delete window[callback]; } catch {} script.remove(); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('MERCADO_LIVRE_BROWSER_SEARCH_TIMEOUT')); }, 8000);
      window[callback] = payload => { clearTimeout(timer); cleanup(); resolve(payload || {}); };
      script.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error('MERCADO_LIVRE_BROWSER_SEARCH_FAILED')); };
      script.src = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=20&callback=${encodeURIComponent(callback)}`;
      document.head.appendChild(script);
    });
  }

  async function browserSearch(query) {
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

  function normalize(raw, q) {
    return {
      query: raw.query || q,
      total: Number(raw?.paging?.total || 0),
      items: (raw.results || []).map(p => ({
        id: p.id,
        externalProductId: p.id,
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
  }

  function renderResults(box, data) {
    const items = data.items || [];
    box.innerHTML = items.map(p => productCard(p)).join('') || '<p class="muted">Nenhum produto encontrado.</p>';
    window.dispatchEvent(new CustomEvent('orus:products-rendered', { detail: data }));
  }

  async function enrichInBackground(raw, normalized) {
    if (!token() || !normalized.items.length) return;
    try {
      const imported = await fetch(`${API}/products/browser-search-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ results: raw.results || [] })
      });
      if (!imported.ok) return;
      const saved = await imported.json();
      const byId = new Map((saved.items || []).map(p => [String(p.id), p]));
      normalized.items = normalized.items.map(p => ({ ...p, ...(byId.get(String(p.id)) || {}) }));
      window.dispatchEvent(new CustomEvent('orus:products-enriched', { detail: normalized }));
    } catch (error) {
      console.warn('[Orus] Background product enrichment failed; visible search results remain usable.', error);
    }
  }

  async function automaticDiscovery() {
    if (!token()) return;
    const key = 'orus_auto_discovery_v1_' + new Date().toISOString().slice(0,10);
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    const queries = ['celular','notebook','smart tv','eletrodomésticos','casa e decoração','beleza','moda','acessórios','informática','games'];
    for (const q of queries) {
      try {
        const raw = await browserSearch(q);
        if (Array.isArray(raw?.results) && raw.results.length) {
          await fetch(`${API}/products/browser-search-import`, {
            method:'POST',
            headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},
            body:JSON.stringify({results:raw.results})
          });
        }
      } catch (error) {
        console.warn('[Orus] Automatic browser discovery skipped query='+q, error);
      }
      await new Promise(r=>setTimeout(r,350));
    }
    window.dispatchEvent(new CustomEvent('orus:auto-discovery-finished'));
    if (typeof window.__hunterLoad === 'function') window.__hunterLoad();
  }

  window.searchProducts = async function() {
    const input = document.getElementById('productQuery');
    const box = document.getElementById('results');
    const q = input?.value?.trim() || '';
    if (!q || !box) return;
    box.innerHTML = '<p class="muted">Buscando produtos reais...</p>';
    try {
      const raw = await browserSearch(q);
      const normalized = normalize(raw, q);
      normalized.items = normalized.items.map(p => ({ ...p, score: 50 }));
      renderResults(box, normalized);
      void enrichInBackground(raw, normalized);
      return;
    } catch (browserError) {
      console.warn('[Orus] Fast browser search unavailable; using authenticated backend search.', browserError);
    }
    try {
      const response = await fetch(`${API}/products/search?q=${encodeURIComponent(q)}`, {
        headers: token() ? { Authorization: 'Bearer ' + token() } : {},
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`BACKEND_SEARCH_${response.status}`);
      const data = await response.json();
      renderResults(box, data);
      return;
    } catch (error) {
      console.error('[Orus] Mercado Livre search failed', error);
      box.innerHTML = '<p class="error">Não foi possível concluir a busca agora. Nenhum produto foi inventado ou salvo como válido.</p>';
    }
  };
  setTimeout(automaticDiscovery, 1800);
})();
