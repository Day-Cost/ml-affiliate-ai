(() => {
  const API='/api/v1';
  const token=()=>localStorage.getItem('mlai_token')||'';
  const escValue=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const call=async(path,opts={})=>{opts.headers={...(opts.headers||{}),'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})};const r=await fetch(API+path,opts);if(!r.ok)throw new Error((await r.text())||r.statusText);return r.json()};

  function openAffiliateFlow(product){
    if(!product?.productUrl)return;
    let modal=document.getElementById('affiliateFlowModal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='affiliateFlowModal';
      modal.style='position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px';
      modal.innerHTML='<div style="background:#fff;border-radius:18px;max-width:620px;width:100%;padding:22px;box-shadow:0 18px 60px rgba(0,0,0,.3);max-height:90vh;overflow:auto"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><h2 style="margin:0 0 6px">🔗 Vincular produto como afiliado</h2><p class="muted" style="margin:0">O sistema não publica nada antes do link oficial meli.la.</p></div><button id="closeAffiliateFlow" class="btn alt">✕</button></div><div id="affiliateFlowBody" style="margin-top:18px"></div></div>';
      document.body.appendChild(modal);
      document.getElementById('closeAffiliateFlow').onclick=()=>modal.remove();
    }
    const body=document.getElementById('affiliateFlowBody');
    const productUrl=product.productUrl;
    body.innerHTML=`<div class="card" style="margin:0"><strong>${escValue(product.title||'Produto')}</strong><p class="muted small" style="word-break:break-all;margin:8px 0">${escValue(productUrl)}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="copyNormalProduct" class="btn alt">📋 Copiar link do produto</button><a class="btn" href="${escValue(productUrl)}" target="_blank" rel="noopener">🛒 Abrir produto no Mercado Livre</a></div></div><div style="margin-top:16px"><h3 style="margin-bottom:6px">1. Gere o link oficial</h3><p class="small">Abra o produto acima no Mercado Livre e gere o link pelo Portal/Barra de Afiliados. O Mercado Livre informa que o Gerador de Links fica no Portal do Afiliado no computador; a Barra de Afiliados também pode ser usada no celular depois de ativada.</p><a class="btn" href="https://www.mercadolivre.com.br/afiliados" target="_blank" rel="noopener">🚀 Abrir Portal de Afiliados</a></div><div style="margin-top:18px"><h3 style="margin-bottom:6px">2. Cole o link gerado</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="affiliateFlowInput" class="input" style="flex:1;min-width:260px" placeholder="https://meli.la/xxxxx" autocomplete="off"><button id="affiliateFlowSave" class="btn">✓ Vincular e liberar produto</button></div><p id="affiliateFlowStatus" class="muted small" style="margin-bottom:0">Somente links oficiais https://meli.la/... são aceitos.</p></div>`;
    document.getElementById('copyNormalProduct').onclick=async()=>{try{await navigator.clipboard.writeText(productUrl);document.getElementById('copyNormalProduct').textContent='✓ Copiado';}catch{const el=document.createElement('textarea');el.value=productUrl;document.body.appendChild(el);el.select();document.execCommand('copy');el.remove();document.getElementById('copyNormalProduct').textContent='✓ Copiado';}};
    document.getElementById('affiliateFlowSave').onclick=async()=>{
      const input=document.getElementById('affiliateFlowInput');
      const status=document.getElementById('affiliateFlowStatus');
      const btn=document.getElementById('affiliateFlowSave');
      const url=input.value.trim();
      if(!/^https:\/\/meli\.la\/[A-Za-z0-9]+$/i.test(url)){status.textContent='❌ Link inválido. Gere o link dentro do Mercado Livre e cole o meli.la completo.';return;}
      btn.disabled=true;btn.textContent='Vinculando...';status.textContent='Validando e liberando o produto...';
      try{
        await call('/products/'+encodeURIComponent(product.id)+'/affiliate-link',{method:'POST',body:JSON.stringify({affiliateUrl:url})});
        status.textContent='✅ Link afiliado vinculado. O produto foi liberado para a fila de marketing/loja.';
        btn.textContent='✓ Liberado';
        setTimeout(()=>{modal.remove();load();},700);
      }catch(e){btn.disabled=false;btn.textContent='✓ Vincular e liberar produto';status.textContent='❌ Não foi possível vincular. Use somente o meli.la oficial gerado pelo Mercado Livre.';}
    };
    modal.style.display='flex';
  }

  async function load(){
    const box=document.getElementById('hunterAutoResults');if(!box)return;
    box.innerHTML='<p class="muted">Carregando produtos encontrados pelo Hunter...</p>';
    try{
      const products=await call('/products/top');
      const list=products||[];
      box.innerHTML=`<div class="section-title" style="margin-top:18px"><div><h2>Produtos encontrados</h2><span class="muted">Ordenados pelo potencial do Hunter</span></div><span class="muted">${list.length} exibidos</span></div>`+
      (list.length?list.map(p=>{
        const active=!!p.affiliateUrl;
        const hasPrice=Number(p.price)>0;
        const productUrl=p.productUrl||'';
        const image=p.imageUrl||'';
        const score=p.latestScore==null?'—':Number(p.latestScore).toFixed(1);
        return `<div class="card product" style="margin-top:10px" data-product-card="${escValue(p.id)}"><div class="product-row">${image&&productUrl?`<a href="${escValue(productUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><img src="${escValue(image)}" class="product-img" alt="${escValue(p.title||'Produto')}" onerror="this.style.display='none'"></a>`:image?`<img src="${escValue(image)}" class="product-img" alt="${escValue(p.title||'Produto')}" onerror="this.style.display='none'">`:''}<div class="product-main" style="min-width:0;flex:1">${productUrl?`<a href="${escValue(productUrl)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit" onclick="event.stopPropagation()"><strong>${escValue(p.title||'Produto')}</strong></a>`:`<strong>${escValue(p.title||'Produto')}</strong>`}<div class="muted">${hasPrice?'R$ '+Number(p.price).toFixed(2):'Preço não informado'} · ${p.discountPercent?Number(p.discountPercent).toFixed(0)+'% desconto · ':''}${p.categoryName?escValue(p.categoryName)+' · ':''}Score ${score}</div><div class="muted small">${active?'🟢 Link afiliado confirmado. Produto liberado para marketing.':'🟡 Produto encontrado. Ainda bloqueado para publicação até você gerar o link oficial.'}</div></div><div class="score-pill">${active?'🟢 AFILIADO ATIVO':'🟡 AGUARDANDO LINK'}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${productUrl&&!active?`<button class="btn" data-generate-link="${escValue(p.id)}">🔗 Gerar/vincular afiliado</button>`:''}${productUrl?`<a class="btn alt" href="${escValue(productUrl)}" target="_blank" rel="noopener">🛒 Abrir produto</a>`:''}${active?`<a class="btn" href="${escValue(p.affiliateUrl)}" target="_blank" rel="noopener">🔗 Abrir link afiliado</a>`:''}</div></div>`;
      }).join(''):'<div class="card"><p class="muted">Nenhum produto pesquisado ainda. Se a automação estiver ligada e o Mercado Livre conectado, o Hunter preencherá esta área automaticamente.</p></div>');
      box.querySelectorAll('[data-product-card]').forEach(card=>card.onclick=e=>{if(e.target.closest('a,button,input'))return;const p=list.find(x=>String(x.id)===String(card.dataset.productCard));if(p?.productUrl)window.open(p.productUrl,'_blank','noopener');});
      box.querySelectorAll('[data-generate-link]').forEach(btn=>btn.onclick=()=>{const p=list.find(x=>String(x.id)===String(btn.dataset.generateLink));openAffiliateFlow(p)});
    }catch(e){box.innerHTML='<div class="card"><p class="error">Não foi possível carregar os produtos do Hunter agora.</p><button class="btn alt" onclick="window.__hunterLoad&&window.__hunterLoad()">Tentar novamente</button></div>'}
  }
  function mount(){const hunter=document.getElementById('hunter');if(!hunter||document.getElementById('hunterAutoResults'))return;const box=document.createElement('div');box.id='hunterAutoResults';hunter.appendChild(box);window.__hunterLoad=load;load()}
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});setTimeout(mount,500);
})();