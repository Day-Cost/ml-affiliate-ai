(() => {
  const API='/api/v1';
  const token=()=>localStorage.getItem('mlai_token')||'';
  const escValue=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const call=async(path,opts={})=>{opts.headers={...(opts.headers||{}),'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})};const r=await fetch(API+path,opts);if(!r.ok)throw new Error((await r.text())||r.statusText);return r.json()};
  async function load(){
    const box=document.getElementById('hunterAutoResults');
    if(!box)return;
    box.innerHTML='<p class="muted">Carregando produtos encontrados pelo Hunter...</p>';
    try{
      const products=await call('/products/top');
      box.innerHTML=`<div class="section-title" style="margin-top:18px"><h2>Produtos encontrados</h2><span class="muted">Atualizado automaticamente</span></div>`+
        ((products||[]).length?products.map(p=>{
          const active=!!p.affiliateUrl;
          return `<div class="card product" style="margin-top:10px"><div class="product-row"><img src="${escValue(p.imageUrl||'')}" class="product-img" onerror="this.style.display='none'"><div class="product-main"><strong>${escValue(p.title||'Produto')}</strong><div class="muted">${p.price!=null?'R$ '+Number(p.price).toFixed(2):'Preço não informado'} · ${p.discountPercent?Number(p.discountPercent).toFixed(0)+'% desconto · ':''}${p.categoryName?escValue(p.categoryName)+' · ':''}Score ${p.latestScore??'—'}</div><div class="muted small">Vendas: não persistidas no catálogo atual · Avaliação: disponível na pesquisa quando fornecida</div></div><div class="score-pill">${active?'🟢 AFILIADO ATIVO':'🟡 AGUARDANDO LINK'}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${p.productUrl?`<a class="btn alt" href="${escValue(p.productUrl)}" target="_blank" rel="noopener">Abrir produto</a>`:''}${active?`<a class="btn" href="${escValue(p.affiliateUrl)}" target="_blank" rel="noopener">Abrir link afiliado</a>`:`<input class="input" style="min-width:260px;flex:1" data-affiliate-input="${escValue(p.id)}" placeholder="Cole o link oficial meli.la"><button class="btn" data-affiliate-save="${escValue(p.id)}">Vincular link</button>`}</div></div>`;
        }).join(''):'<div class="card"><p class="muted">Nenhum produto pesquisado ainda. Se o sistema estiver ligado, o Hunter preencherá esta área automaticamente.</p></div>');
      box.querySelectorAll('[data-affiliate-save]').forEach(btn=>btn.onclick=async()=>{try{const id=btn.dataset.affiliateSave;const input=box.querySelector(`[data-affiliate-input="${id}"]`);await call('/products/'+encodeURIComponent(id)+'/affiliate-link',{method:'POST',body:JSON.stringify({affiliateUrl:input.value.trim()})});btn.textContent='✓ Vinculado';await load()}catch(e){alert('Use somente o link oficial de afiliado meli.la gerado pelo Mercado Livre.')}});
    }catch(e){box.innerHTML='<div class="card"><p class="error">Não foi possível carregar os produtos do Hunter agora.</p><button class="btn alt" onclick="window.__hunterLoad&&window.__hunterLoad()">Tentar novamente</button></div>'}
  }
  function mount(){
    const hunter=document.getElementById('hunter');
    if(!hunter||document.getElementById('hunterAutoResults'))return;
    const box=document.createElement('div');box.id='hunterAutoResults';hunter.appendChild(box);window.__hunterLoad=load;load();
  }
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(mount,500);
})();
