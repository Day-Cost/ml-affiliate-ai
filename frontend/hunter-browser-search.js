(() => {
  const API = '/api/v1';
  const token = () => localStorage.getItem('mlai_token') || '';
  const previousSearch = window.searchProducts;

  async function browserFetchSearch(query) {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=20`;
    const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`MERCADO_LIVRE_BROWSER_HTTP_${response.status}`);
    return response.json();
  }

  function browserJsonpSearch(query) {
    return new Promise((resolve, reject) => {
      const callback = `__orusSearch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const cleanup = () => { try { delete window[callback]; } catch {} script.remove(); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('MERCADO_LIVRE_JSONP_TIMEOUT')); }, 8000);
      window[callback] = data => { clearTimeout(timer); cleanup(); resolve(data || {}); };
      script.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error('MERCADO_LIVRE_JSONP_FAILED')); };
      script.src = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=20&callback=${callback}`;
      document.head.appendChild(script);
    });
  }

  async function browserSearch(query) {
    try { return await browserFetchSearch(query); }
    catch (corsError) { return browserJsonpSearch(query); }
  }

  function normalize(raw) {
    return (raw.results || []).map(p => ({
      id: p.id,
      title: p.title,
      price: Number(p.price || 0),
      originalPrice: p.original_price == null ? null : Number(p.original_price),
      discountPercent: p.original_price && p.price ? Math.max(0, ((Number(p.original_price) - Number(p.price)) / Number(p.original_price)) * 100) : 0,
      rating: p.reviews?.rating_average ?? null,
      reviewsCount: p.reviews?.total ?? 0,
      soldQuantity: p.sold_quantity ?? null,
      thumbnail: p.thumbnail || '',
      permalink: p.permalink || '',
      score: 50,
      dataQuality: { demand: p.sold_quantity != null ? 'REAL' : 'LIMITED', conversion: 'NOT_AVAILABLE', commission: 'LINK_REQUIRED' }
    }));
  }

  async function importResults(raw) {
    if (!token() || !Array.isArray(raw.results) || !raw.results.length) return;
    try {
      await fetch(`${API}/products/browser-search-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ results: raw.results })
      });
    } catch (error) { console.warn('[Orus] Product import failed', error); }
  }

  window.searchProducts = async function() {
    const input = document.getElementById('productQuery');
    const box = document.getElementById('results');
    const query = input?.value?.trim() || '';
    if (!query || !box) return;
    box.innerHTML = '<p class="muted">Buscando produtos reais no Mercado Livre...</p>';
    try {
      const raw = await browserSearch(query);
      const items = normalize(raw);
      if (!items.length) { box.innerHTML = '<p class="muted">Nenhum produto real encontrado.</p>'; return; }
      box.innerHTML = items.map(p => typeof productCard === 'function' ? productCard(p) : `<div class="card"><strong>${String(p.title || '')}</strong><p>R$ ${p.price.toFixed(2)}</p><a href="${p.permalink}" target="_blank">Abrir no Mercado Livre</a></div>`).join('');
      void importResults(raw);
      return;
    } catch (browserError) {
      console.warn('[Orus] Browser search failed; restoring authenticated backend path', browserError);
      if (typeof previousSearch === 'function') return previousSearch();
      box.innerHTML = '<p class="error">Não foi possível concluir a busca agora.</p>';
    }
  };

  async function automaticDiscovery() {
    if (!token()) return;
    const key = 'orus_auto_discovery_v1_' + new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(key)) return;
    const queries = ['celular', 'notebook', 'smart tv', 'eletrodomésticos', 'casa e decoração', 'beleza', 'moda', 'acessórios', 'informática', 'games'];
    let importedAny = false;
    for (const q of queries) {
      try {
        const raw = await browserSearch(q);
        if (Array.isArray(raw?.results) && raw.results.length) { await importResults(raw); importedAny = true; }
      } catch (error) { console.warn('[Orus] Automatic discovery skipped query=' + q, error); }
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    if (importedAny) localStorage.setItem(key, '1');
    window.dispatchEvent(new CustomEvent('orus:auto-discovery-finished'));
    if (typeof window.__hunterLoad === 'function') window.__hunterLoad();
  }

  setTimeout(automaticDiscovery, 1800);
})();
