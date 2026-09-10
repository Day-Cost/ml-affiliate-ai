(() => {
  async function bind(card){
    if(card.querySelector('[data-affiliate-link]'))return;
    const dbId=card.dataset.dbId||card.getAttribute('data-product-id'); if(!dbId)return;
    const row=document.createElement('div'); row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
    const b=document.createElement('button'); b.className='btn'; b.dataset.affiliateLink='1'; b.textContent='Vincular link de afiliado';
    b.onclick=async()=>{const url=prompt('Cole aqui o link de afiliado gerado pelo Mercado Livre:');if(!url)return;const t=localStorage.getItem('mlai_token')||'';try{const r=await fetch('/api/v1/products/'+encodeURIComponent(dbId)+'/affiliate-link',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({affiliateUrl:url.trim()})});if(!r.ok)throw new Error();b.textContent='✓ Link vinculado';}catch(e){alert('Não foi possível vincular o link. Use um endereço HTTPS real gerado pelo Mercado Livre.')}};
    row.appendChild(b);card.appendChild(row);
  }
  function scan(){document.querySelectorAll('#results [data-db-id],#results .result-card').forEach(bind)}
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});setTimeout(scan,1000);
})();
