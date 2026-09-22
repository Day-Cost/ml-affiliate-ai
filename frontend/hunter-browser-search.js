(() => {
  const API = '/api/v1';
  const token = () => localStorage.getItem('mlai_token') || '';

  async function browserFetchSearch(query) {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=20`;
    const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`MERCADO_LIVRE_BROWSER_HTTP_${response.status}`);
    return response.json();
  }

  async function browserSearch(query) {
    return browserFetchSearch(query);
  }

  async function automaticDiscovery() {
    if (!token()) return;
    const key = 'orus_auto_discovery_v1_' + new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(key)) return;
    const queries = ['celular', 'notebook', 'smart tv', 'eletrodomésticos', 'casa e decoração', 'beleza', 'moda', 'acessórios', 'informática', 'games'];
    let importedAny = false;
    for (const q of queries) {
      try {
        const raw = await browserSearch(q);
        if (Array.isArray(raw?.results) && raw.results.length) {
          const response = await fetch(`${API}/products/browser-search-import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
            body: JSON.stringify({ results: raw.results })
          });
          if (response.ok) importedAny = true;
        }
      } catch (error) {
        console.warn('[Orus] Automatic browser discovery skipped query=' + q, error);
      }
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    if (importedAny) localStorage.setItem(key, '1');
    window.dispatchEvent(new CustomEvent('orus:auto-discovery-finished'));
    if (typeof window.__hunterLoad === 'function') window.__hunterLoad();
  }

  // The main search is intentionally left to app.js, whose authenticated backend
  // flow was the previously working path. This file only handles optional discovery.
  setTimeout(automaticDiscovery, 1800);
})();
