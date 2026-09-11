(() => {
  const PORTAL='https://www.mercadolivre.com.br/l/afiliados-portal-do-afiliado';
  const GENERATOR_HELP='https://www.mercadolivre.com.br/l/afiliados-gere-seus-links';
  const escA=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>Number(v||0)>0?'R$ '+Number(v).toFixed(2):'Preço não informado';
  const affiliateRegex=/^https:\/\/meli\.la\/[A-Za-z0-9]+$/i;

  async function saveAffiliate(productId,url,statusEl,btn){
    if(!affiliateRegex.test(url)){statusEl.textContent='❌ Use o link oficial https://meli.la/... gerado pelo Mercado Livre.';return;}
    btn.disabled=true;btn.textContent='Vinculando...';statusEl.textContent='Validando link e liberando produto...';
    try{
      await api('/products/'+encodeURIComponent(productId)+'/affiliate-link',{method:'POST',body:JSON.stringify({affiliateUrl:url})});
      statusEl.textContent='✅ Link afiliado salvo. Produto liberado para a fila automática.';
      btn.textContent='✓ Link salvo';
    }catch(e){btn.disabled=false;btn.textContent='Salvar link';statusEl.textContent='❌ Não foi possível salvar o link. Tente novamente.';}
  }

  window.searchProducts=async function(){
    const input=document.getElementById('productQuery');
    const q=input?.value.trim();
    if(!q)return;
    const box=document.getElementById('results');
    box.innerHTML='<div class="card"><p class="muted">🔎 Buscando produtos reais no catálogo do Mercado Livre...</p></div>';
    try{
      const d=await api('/products/search?q='+encodeURIComponent(q));
      const items=d.items||[];
      if(!items.length){box.innerHTML='<div class="card"><p class="muted">Nenhum produto encontrado.</p></div>';return;}
      box.innerHTML=`<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><strong>📦 Lote encontrado: ${items.length} produtos</strong><div class="muted small">Cada produto abaixo tem acesso direto ao Mercado Livre e ao Portal do Afiliado.</div></div><a class="btn" href="${PORTAL}" target="_blank" rel="noopener">🔗 Abrir Portal de Afiliados</a></div><p class="muted small" style="margin-bottom:0">No computador, use o Gerador de Links do Portal. No celular, o Mercado Livre informa que a Barra de Afiliados pode gerar links depois de ativada.</p></div>`+
      items.map((p,i)=>{
        const productUrl=p.permalink||'';
        const active=!!p.affiliateUrl;
        const img=p.thumbnail||'';
        return `<div class="card product" style="margin-top:10px" data-aff-product="${escA(p.dbId||p.id)}"><div class="product-row">${img?`<img src="${escA(img)}" class="product-img" alt="" onerror="this.style.display='none'">`:''}<div class="product-main" style="min-width:0;flex:1"><strong>${escA(p.title||'Produto')}</strong><div class="muted">${money(p.price)}${p.discountPercent?` · ${Number(p.discountPercent).toFixed(0)}% desconto`:''}${p.reviewsCount?` · ${p.reviewsCount} avaliações`:''}</div><div class="muted small">${active?'🟢 Link afiliado já vinculado':'🟡 Aguardando link oficial de afiliado'}</div></div><div class="score-pill">${active?'AFILIADO':'LOTE '+(i+1)}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${productUrl?`<a class="btn" href="${escA(productUrl)}" target="_blank" rel="noopener">🛒 1. Abrir produto no Mercado Livre</a>`:''}<a class="btn alt" href="${GENERATOR_HELP}" target="_blank" rel="noopener">🔗 2. Gerar link de afiliado</a>${active?`<a class="btn" href="${escA(p.affiliateUrl)}" target="_blank" rel="noopener">Abrir link afiliado</a>`:''}</div>${!active?`<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><input class="input affiliate-input" placeholder="Cole aqui o https://meli.la/... gerado pelo Mercado Livre" autocomplete="off" style="flex:1;min-width:250px"><button class="btn save-affiliate">Salvar link</button></div><div class="muted small affiliate-status" style="margin-top:6px">Fluxo: abrir produto → gerar link no Mercado Livre → colar aqui → salvar.</div>`:''}</div>`;
      }).join('');
      box.querySelectorAll('[data-aff-product]').forEach(card=>{
        const id=card.dataset.affProduct;
        const save=card.querySelector('.save-affiliate');
        if(save)save.onclick=()=>saveAffiliate(id,card.querySelector('.affiliate-input').value.trim(),card.querySelector('.affiliate-status'),save);
      });
    }catch(e){
      box.innerHTML=`<div class="card"><p class="error">Não foi possível buscar produtos agora.</p><p class="muted small">O sistema manterá a conexão do Mercado Livre e não solicitará nova autorização automaticamente.</p><button class="btn alt" onclick="window.searchProducts()">Tentar novamente</button></div>`;
    }
  };
})();
