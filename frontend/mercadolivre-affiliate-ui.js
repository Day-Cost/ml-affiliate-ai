(() => {
  let mounted = false;
  const API='/api/v1';
  const token=()=>localStorage.getItem('mlai_token')||'';
  async function call(path,opts={}){opts.headers={...(opts.headers||{}),'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})};const r=await fetch(API+path,opts);if(!r.ok)throw new Error((await r.text())||r.statusText);return r.json()}
  const esc=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  async function refresh(){
    const box=document.getElementById('mlAffiliateControl'); if(!box)return;
    try{
      const s=await call('/marketplace/mercadolivre/status');
      box.querySelector('[data-api-status]').innerHTML=s.connected?'<span class="status ok-bg">● API Mercado Livre conectada</span>':'<span class="status warn">○ API Mercado Livre não conectada</span>';
      box.querySelector('[data-api-detail]').textContent=s.connected?`Escopos: ${s.scope||'não informado'} · leitura: ${s.canRead?'OK':'não'} · escrita: ${s.canWrite?'OK':'não'}`:'Conecte sua conta para habilitar a pesquisa autenticada.';
    }catch(e){box.querySelector('[data-api-status]').innerHTML='<span class="status warn">Erro ao verificar API</span>'}
  }
  function mount(){
    const panel=document.getElementById('mercadolivre');
    if(!panel||mounted)return;
    mounted=true;
    const target=panel.querySelector('.settings-grid')||panel;
    const card=document.createElement('div');card.id='mlAffiliateControl';card.className='card';
    card.innerHTML=`<h2>Afiliados — controle oficial</h2><p class="muted">A API do Mercado Livre e o Programa de Afiliados são integrações diferentes. A API pode pesquisar produtos e sincronizar a conta; a geração do link de afiliado deve ser feita pelo Portal/Barra de Afiliados oficial.</p><div data-api-status style="margin:8px 0">Verificando...</div><div data-api-detail class="muted small">—</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn" data-api-connect>Conectar Mercado Livre API</button><button class="btn alt" data-affiliate-portal>Abrir Portal de Afiliados</button><button class="btn alt" data-test>Testar conexão</button></div><div class="result-card" style="margin-top:12px"><b>Fluxo automático protegido</b><p class="muted small">Hunter → seleciona produtos → você vincula o link oficial meli.la → sistema coloca o produto na fila de conteúdo e loja → publicação automática só ocorre quando a plataforma e as permissões oficiais permitirem.</p></div><div data-test-out class="muted small"></div>`;
    target.appendChild(card);
    card.querySelector('[data-api-connect]').onclick=()=>{window.connectIntegration?.('mercadolivre')||alert('Use o botão de conexão da seção Mercado Livre.')};
    card.querySelector('[data-affiliate-portal]').onclick=()=>window.open('https://www.mercadolivre.com.br/l/afiliados-home','_blank','noopener');
    card.querySelector('[data-test]').onclick=async()=>{const out=card.querySelector('[data-test-out]');out.textContent='Testando...';try{const s=await call('/marketplace/mercadolivre/status');out.textContent=s.connected?(s.canRead?'✓ API autorizada para leitura.':'⚠ Conta conectada, mas falta escopo read.'):'⚠ Conta ainda não conectada.'}catch(e){out.textContent='✕ Falha no diagnóstico.'}};
    refresh();
  }
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});setTimeout(mount,800);
})();
