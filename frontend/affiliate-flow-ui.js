(() => {
  const API = '/api/v1';
  const token = () => localStorage.getItem('mlai_token') || '';
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));

  async function saveAffiliate(product, input, status, button) {
    const url = input.value.trim();
    if (!/^https:\/\/meli\.la\/[A-Za-z0-9]+$/i.test(url)) {
      status.textContent = '❌ Cole o link oficial https://meli.la/... correspondente a este produto.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Preparando...';
    status.textContent = 'Salvando o link e preparando as publicidades...';
    try {
      const externalId = String(product?.externalProductId || product?.id || '').trim();
      const dbId = String(product?.dbId || '').trim();
      const path = externalId
        ? API + '/products/by-item/' + encodeURIComponent(externalId) + '/affiliate-link'
        : API + '/products/' + encodeURIComponent(dbId) + '/affiliate-link';
      const r = await fetch(path, {
        method: 'POST',
        headers: {'Content-Type':'application/json', ...(token() ? {Authorization:'Bearer '+token()} : {})},
        body: JSON.stringify({ affiliateUrl: url })
      });
      if (!r.ok) throw new Error(await r.text());
      button.textContent = '✓ Link salvo';
      status.textContent = '✅ Link salvo. Conteúdos de WEB, TikTok, Instagram e Pinterest foram colocados na fila.';
      input.disabled = true;
    } catch (e) {
      button.disabled = false;
      button.textContent = '🔗 Salvar link e iniciar';
      status.textContent = '❌ Não foi possível salvar. Confirme se o link é o oficial https://meli.la/... deste produto.';
      console.error('[Orus] affiliate link save failed', e);
    }
  }

  function decorateCard(card, product) {
    if (!card || card.querySelector('[data-affiliate-flow]') || !product?.id) return card;
    const anchor = card.querySelector('a.btn');
    if (!anchor) return card;
    const wrap = document.createElement('div');
    wrap.dataset.affiliateFlow = '1';
    wrap.style.cssText = 'margin-top:10px;padding:12px;border:1px solid #dbe2ee;border-radius:14px;background:#f8fafc';
    wrap.innerHTML = `<strong>🔗 Seu link de afiliado</strong><div class="small muted" style="margin:4px 0 8px">Abra o produto acima, gere o link oficial no Mercado Livre e cole aqui. A partir dele o Orus inicia o restante do processo.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" data-affiliate-input placeholder="https://meli.la/..." autocomplete="off" style="flex:1;min-width:220px"><button class="btn" data-affiliate-save>🔗 Salvar link e iniciar</button></div><div class="muted small" data-affiliate-status style="margin-top:7px">Nenhum gasto ou ação financeira será executado sem sua aprovação.</div>`;
    const input = wrap.querySelector('[data-affiliate-input]');
    const button = wrap.querySelector('[data-affiliate-save]');
    const status = wrap.querySelector('[data-affiliate-status]');
    button.onclick = () => saveAffiliate(product, input, status, button);
    anchor.insertAdjacentElement('afterend', wrap);
    return card;
  }

  function decorateExisting() {
    const results = document.getElementById('results');
    if (!results) return;
    results.querySelectorAll('.card.product').forEach(card => {
      if (card.querySelector('[data-affiliate-flow]')) return;
      const externalId = card.dataset.externalProductId || card.dataset.productId || card.dataset.dbId;
      if (!externalId) return;
      decorateCard(card, { id: externalId, externalProductId: externalId, dbId: card.dataset.dbId || '' });
    });
  }

  window.addEventListener('orus:products-rendered', event => {
    const products = event.detail?.items || [];
    const cards = document.querySelectorAll('#results .card.product');
    products.forEach((product, index) => decorateCard(cards[index], product));
  });

  window.addEventListener('orus:products-enriched', event => {
    const products = event.detail?.items || [];
    const cards = document.querySelectorAll('#results .card.product');
    products.forEach((product, index) => decorateCard(cards[index], product));
  });

  const timer = setInterval(() => {
    decorateExisting();
    if (document.getElementById('results')) {
      // Keep a short-lived observer loop for cards created by older UI code.
      setTimeout(() => clearInterval(timer), 10000);
    }
  }, 300);
})();
