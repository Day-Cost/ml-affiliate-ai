(() => {
  let installed = false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function install() {
    const panel = document.getElementById('tiktok');
    if (!panel || installed) return;
    installed = true;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h2>7. Controle obrigatório do TikTok</h2><p class="muted">O TikTok exige que o criador veja e controle as opções antes do envio.</p><div id="ttComplianceInfo" class="muted small">Consultando Creator Info...</div><div class="form-grid"><div><label>Título</label><input id="ttTitle" class="input" maxlength="90" placeholder="Título editável"></div><div><label>Privacidade</label><select id="ttPrivacy" class="input"><option value="">Carregando opções...</option></select></div></div><div style="display:grid;gap:8px;margin-top:12px"><label><input type="checkbox" id="ttComment"> Permitir comentários</label><label><input type="checkbox" id="ttDuet"> Permitir Duet</label><label><input type="checkbox" id="ttStitch"> Permitir Stitch</label><label><input type="checkbox" id="ttCommercial"> Conteúdo comercial</label><label><input type="checkbox" id="ttBrandContent"> Branded Content / parceria paga</label><label><input type="checkbox" id="ttAigc"> Conteúdo gerado por IA</label><label><input type="checkbox" id="ttConsent"> Confirmo que revisei o conteúdo e autorizo o envio para o TikTok.</label></div><div id="ttVideoPreview" style="margin-top:12px"></div><div id="ttComplianceError" class="error"></div>`;
    panel.querySelector('.settings-grid')?.appendChild(card);
    document.getElementById('ttVideoUrl')?.addEventListener('input', updatePreview);
    ['ttCommercial','ttBrandContent'].forEach(id => document.getElementById(id)?.addEventListener('change', updateCommercial));
    await loadCreator();
    const original = window.tiktokPublish;
    window.tiktokPublish = async function() {
      const url = document.getElementById('ttVideoUrl')?.value.trim();
      const title = document.getElementById('ttTitle')?.value.trim();
      const privacyLevel = document.getElementById('ttPrivacy')?.value;
      const commercial = document.getElementById('ttCommercial')?.checked;
      const brand = document.getElementById('ttBrandContent')?.checked;
      const consent = document.getElementById('ttConsent')?.checked;
      const err = document.getElementById('ttComplianceError');
      err.textContent = '';
      if (!url) return err.textContent = 'Informe a URL do vídeo.';
      if (!privacyLevel) return err.textContent = 'Selecione manualmente a privacidade.';
      if (!consent) return err.textContent = 'Você precisa confirmar o consentimento antes do envio.';
      if (!commercial || !brand) return err.textContent = 'Como este conteúdo promove produto de terceiros, ative Conteúdo comercial e Branded Content.';
      const preview = document.querySelector('#ttVideoPreview video');
      if (preview?.duration && Number.isFinite(preview.duration)) {
        const max = Number(card.dataset.maxDuration || 0);
        if (max && preview.duration > max) return err.textContent = `O vídeo tem ${preview.duration.toFixed(1)}s, acima do limite de ${max}s do criador.`;
      }
      const box = document.getElementById('ttPublishResult');
      box.innerHTML = '<p class="muted">Enviando após sua autorização...</p>';
      try {
        const d = await window.api('/marketplace/tiktok/publish/video', { method:'POST', body:JSON.stringify({ videoUrl:url, title:title || undefined, privacyLevel, disableComment:!document.getElementById('ttComment').checked, disableDuet:!document.getElementById('ttDuet').checked, disableStitch:!document.getElementById('ttStitch').checked, isAigc:document.getElementById('ttAigc').checked, brandContentToggle:brand, brandOrganicToggle:false, consent:true }) });
        box.innerHTML = `<div class="result-card"><b>Publicação enviada</b><pre>${window.esc(JSON.stringify(d,null,2))}</pre><button class="btn alt" onclick="tiktokStatus()">Ver status</button></div>`;
      } catch (e) { box.innerHTML = '<p class="error">O TikTok recusou ou não autorizou o envio. Verifique permissões e Creator Info.</p>'; }
    };
    if (!window.api) window.api = async (path,opts={}) => { const t=localStorage.getItem('mlai_token')||''; opts.headers={...(opts.headers||{}),'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})}; const r=await fetch('/api/v1'+path,opts); if(!r.ok) throw new Error(await r.text()); return r.json(); };
    if (!window.esc) window.esc = v => String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  }
  async function loadCreator() {
    try {
      const d = await (window.api || (async p => fetch('/api/v1'+p).then(r=>r.json())))('/marketplace/tiktok/creator-info');
      const info = d.data || d;
      const options = info.privacy_level_options || [];
      const select = document.getElementById('ttPrivacy');
      if (select) select.innerHTML = '<option value="">Selecione...</option>' + options.map(x => `<option value="${x}">${x}</option>`).join('');
      const max = Number(info.max_video_post_duration_sec || 0);
      const card = document.getElementById('ttComplianceInfo')?.parentElement;
      if (card) card.dataset.maxDuration = String(max);
      const out = document.getElementById('ttComplianceInfo');
      if (out) out.textContent = `Criador: ${info.creator_nickname || info.nickname || 'autorizado'} · limite de vídeo: ${max || 'consultado pelo TikTok'}s`;
    } catch (_) {
      const out = document.getElementById('ttComplianceInfo'); if (out) out.textContent = 'Conecte o TikTok e consulte Creator Info antes de publicar.';
    }
  }
  function updateCommercial(){ const commercial=document.getElementById('ttCommercial')?.checked; const brand=document.getElementById('ttBrandContent'); if(brand) brand.disabled=!commercial; if(!commercial&&brand) brand.checked=false; }
  function updatePreview(){ const url=document.getElementById('ttVideoUrl')?.value.trim(); const box=document.getElementById('ttVideoPreview'); if(!box)return; box.innerHTML=url?`<video controls playsinline preload="metadata" style="width:min(100%,360px);max-height:520px;border-radius:12px" src="${url}"></video>`:''; }
  const observer = new MutationObserver(() => install()); observer.observe(document.documentElement,{childList:true,subtree:true}); setTimeout(install,700);
})();
