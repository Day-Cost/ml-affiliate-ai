(() => {
  const API = '/api/v1';
  const token = () => localStorage.getItem('mlai_token') || '';
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));

  async function api(path, opts = {}) {
    const r = await fetch(API + path, {
      ...opts,
      headers: {'Content-Type':'application/json', ...(token() ? {Authorization:'Bearer '+token()} : {}), ...(opts.headers || {})}
    });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  }

  function mount() {
    const hunter = document.getElementById('hunter');
    if (!hunter || document.getElementById('affiliateImportCard')) return;
    const card = document.createElement('div');
    card.id = 'affiliateImportCard';
    card.className = 'card';
    card.style.marginBottom = '18px';
    card.innerHTML =
      '<div class="eyebrow">NOVA ENTRADA</div>' +
      '<h2>🔗 Adicionar produto por link de afiliado</h2>' +
      '<p class="muted">Você encontra o produto no Mercado Livre, gera o seu link de afiliado e cola aqui. O Orus não cria, modifica ou substitui o seu link.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<input id="affiliateImportUrl" class="input" style="flex:1;min-width:260px" placeholder="Cole aqui o link de afiliado do Mercado Livre" autocomplete="off">' +
      '<button id="affiliateImportBtn" class="btn">Importar e preparar marketing</button></div>' +
      '<div id="affiliateImportStatus" class="muted small" style="margin-top:9px">Nenhuma busca automática é necessária para adicionar este produto.</div>';
    hunter.insertBefore(card, hunter.children[1] || hunter.firstChild);
    card.querySelector('#affiliateImportBtn').onclick = importLink;
  }

  async function importLink() {
    const input = document.getElementById('affiliateImportUrl');
    const status = document.getElementById('affiliateImportStatus');
    const button = document.getElementById('affiliateImportBtn');
    const url = input.value.trim();
    if (!url) { status.textContent = '❌ Cole o link de afiliado.'; return; }
    button.disabled = true;
    status.textContent = '⏳ Identificando o produto e preparando a fila de marketing...';
    try {
      const d = await api('/products/import-affiliate-link', {method:'POST', body:JSON.stringify({affiliateUrl:url})});
      const p = d.product || {};
      status.innerHTML = '✅ <strong>' + esc(p.title || 'Produto importado') + '</strong> foi adicionado. Marketing: ' + esc((d.marketing?.channels || []).join(', ') || 'fila') + '.';
      input.value = '';
      window.dispatchEvent(new CustomEvent('orus:affiliate-imported', {detail:d}));
    } catch (e) {
      status.textContent = '❌ Não foi possível importar este link. Confirme que ele é um link oficial do Mercado Livre e que a publicação está ativa.';
      console.error('[Orus] affiliate import failed', e);
    } finally {
      button.disabled = false;
    }
  }

  const timer = setInterval(() => {
    mount();
    if (document.getElementById('affiliateImportCard')) clearInterval(timer);
  }, 250);
})();