(() => {
  const API = '/api/v1';
  const token = () => localStorage.getItem('mlai_token') || '';
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));

  async function saveAffiliate(productId, input, status, button) {
    const url = input.value.trim();
    if (!/^https:\/\/meli\.la\/[A-Za-z0-9]+$/i.test(url)) {
      status.textContent = '❌ Cole o link oficial https://meli.la/... correspondente a este produto.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Preparando...';
    status.textContent = 'Salvando o link e preparando as publicidades...';
    try {
      const r = await fetch(API + '/products/' + encodeURIComponent(productId) + '/affiliate-link', {
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
      status.textContent = '❌ Não foi possível salvar. Confirme se o link começa por https://meli.la/. ';
    }
  }

  function decorateCard(card, product) {
    if (!card || card.querySelector('[data-affiliate-flow]') || !product?.dbId) return card;
    const anchor = card.querySelector('a.btn');
    if (!anchor) return card;
    const wrap = document.createElement('div');
    wrap.dataset.affiliateFlow = '1';
    wrap.style.cssText = 'margin-top:10px;padding:12px;border:1px solid #dbe2ee;border-radius:14px;background:#f8fafc';
    wrap.innerHTML = `<strong>🔗 Seu link de afiliado</strong><div class="small muted" style="margin:4px 0 8px">Abra o produto acima, gere o link oficial no Mercado Livre e cole aqui. A partir dele o Orus inicia o restante do processo.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" data-affiliate-input placeholder="https://meli.la/..." autocomplete="off" style="flex:1;min-width:220px"><button class="btn" data-affiliate-save>🔗 Salvar link e iniciar</button></div><div class="muted small" data-affiliate-status style="margin-top:7px">Nenhum gasto ou ação financeira será executado sem sua aprovação.</div>`;
    const input = wrap.querySelector('[data-affiliate-input]');
    const button = wrap.querySelector('[data-affiliate-save]');
    const status = wrap.querySelector('[data-affiliate-status]');
    button.onclick = () => saveAffiliate(product.dbId, input, status, button);
    anchor.insertAdjacentElement('afterend', wrap);
    return card;
  }

  function patchProductCard() {
    if (typeof window.productCard !== 'function' || window.productCard.__affiliateFlowPatched) return;
    const original = window.productCard;
    const patched = function(product) {
      const html = original(product);
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const card = holder.firstElementChild;
      decorateCard(card, product);
      return holder.innerHTML;
    };
    patched.__affiliateFlowPatched = true;
    window.productCard = patched;
  }

  function decorateExisting() {
    const results = document.getElementById('results');
    if (!results) return;
    // Existing cards created before the patch are rebuilt only when a new search runs.
    // Pending cards are handled by hunter-ui.js and already have the same flow.
    results.querySelectorAll('.card.product').forEach(card => {
      if (card.querySelector('[data-affiliate-flow]')) return;
      const dbId = card.dataset.dbId || card.getAttribute('data-product-id');
      if (!dbId) return;
      decorateCard(card, {dbId});
    });
  }

  const timer = setInterval(() => {
    patchProductCard();
    decorateExisting();
    if (typeof window.productCard === 'function' && window.productCard.__affiliateFlowPatched) clearInterval(timer);
  }, 200);
})();
