(() => {
  let mounted = false;
  const api = async (path, opts = {}) => {
    const token = localStorage.getItem('mlai_token') || '';
    opts.headers = { ...(opts.headers || {}), 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
    const r = await fetch('/api/v1' + path, opts);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  async function loadStatus() {
    const status = document.getElementById('fbStatus');
    if (!status) return;
    try {
      const s = await api('/marketplace/facebook/status');
      status.innerHTML = !s.configured
        ? '<span class="status warn">○ Configuração pendente no servidor</span>'
        : s.connected
          ? '<span class="status ok-bg">● Facebook conectado</span>'
          : '<span class="status">○ Não conectado</span>';
      const page = document.getElementById('fbSelectedPage');
      if (page) page.textContent = s.selectedPageName ? 'Página: ' + s.selectedPageName : 'Nenhuma Página selecionada';
      const btn = document.getElementById('fbConnect');
      if (btn) btn.textContent = s.connected ? 'Reconectar Facebook' : 'Conectar Facebook';
      if (s.connected) loadPages();
    } catch {
      status.innerHTML = '<span class="status warn">Erro ao verificar Facebook</span>';
    }
  }

  async function loadPages() {
    const box = document.getElementById('fbPages');
    if (!box) return;
    box.innerHTML = '<p class="muted">Carregando Páginas...</p>';
    try {
      const d = await api('/marketplace/facebook/pages');
      const items = d.items || [];
      box.innerHTML = items.length ? items.map(p => `
        <div class="list-row">
          <div><b>${esc(p.name)}</b><div class="muted small">${esc(p.category || '')}</div></div>
          <button class="btn ${p.selected ? '' : 'alt'}" onclick="window.orusFacebookSelect('${esc(p.id)}')">${p.selected ? 'Selecionada' : 'Selecionar'}</button>
        </div>`).join('') : '<p class="muted">Nenhuma Página disponível para esta conta.</p>';
    } catch (e) {
      box.innerHTML = '<p class="error">Não foi possível carregar as Páginas. Reconecte o Facebook.</p>';
    }
  }

  async function selectPage(id) {
    try {
      await api('/marketplace/facebook/select-page', { method: 'POST', body: JSON.stringify({ pageId: id }) });
      await loadStatus();
      await loadPages();
    } catch (e) {
      alert('Não foi possível selecionar esta Página.');
    }
  }

  async function connect() {
    try {
      const d = await api('/marketplace/facebook/connect-url');
      if (d?.url) location.href = d.url;
      else alert('A integração do Facebook ainda não está configurada no servidor.');
    } catch (e) {
      alert('Não foi possível iniciar a conexão do Facebook. Verifique o App Meta e o URI de retorno.');
    }
  }

  async function publishText() {
    const out = document.getElementById('fbPublishOut');
    out.textContent = 'Publicando...';
    try {
      const d = await api('/marketplace/facebook/publish/text', {
        method: 'POST',
        body: JSON.stringify({
          message: document.getElementById('fbMessage').value.trim(),
          link: document.getElementById('fbLink').value.trim() || undefined
        })
      });
      out.innerHTML = '<pre>' + esc(JSON.stringify(d, null, 2)) + '</pre>';
    } catch (e) {
      out.textContent = 'Publicação recusada. Verifique a Página selecionada e as permissões Meta.';
    }
  }

  async function publishImage() {
    const out = document.getElementById('fbPublishImageOut');
    out.textContent = 'Publicando...';
    try {
      const d = await api('/marketplace/facebook/publish/image', {
        method: 'POST',
        body: JSON.stringify({
          imageUrl: document.getElementById('fbImageUrl').value.trim(),
          caption: document.getElementById('fbImageCaption').value.trim()
        })
      });
      out.innerHTML = '<pre>' + esc(JSON.stringify(d, null, 2)) + '</pre>';
    } catch (e) {
      out.textContent = 'Publicação recusada. A imagem precisa estar em URL pública e a Página precisa estar autorizada.';
    }
  }

  function mount() {
    if (mounted || !document.querySelector('.app-shell')) return;
    mounted = true;

    const nav = document.querySelector('.sidebar nav');
    const instagramNav = [...nav.querySelectorAll('.nav-item')].find(x => x.dataset.target === 'instagram');
    if (instagramNav) {
      const fbNav = document.createElement('button');
      fbNav.className = 'nav-item';
      fbNav.dataset.target = 'facebook';
      fbNav.innerHTML = 'f <span>Facebook</span>';
      fbNav.onclick = () => window.orusFacebookOpen();
      instagramNav.insertAdjacentElement('afterend', fbNav);
    }

    const main = document.querySelector('.main');
    const panel = document.createElement('section');
    panel.id = 'facebook';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">PLATAFORMA 04</div><h1>f Facebook</h1><p class="muted">Facebook Pages conectado ao ecossistema Meta. Publicação oficial sem anúncios pagos.</p></div></div>
      <div class="grid settings-grid">
        <div class="card">
          <h2>1. Conta e conexão</h2>
          <div id="fbStatus"><span class="status">Verificando...</span></div>
          <p id="fbSelectedPage" class="muted">Nenhuma Página selecionada</p>
          <button id="fbConnect" class="btn">Conectar Facebook</button>
        </div>
        <div class="card">
          <h2>2. Página comercial</h2>
          <p class="muted">Escolha a Página que o Orus poderá administrar. O perfil pessoal não será usado para publicação.</p>
          <div id="fbPages"></div>
        </div>
        <div class="card">
          <h2>3. Publicar texto/link</h2>
          <textarea id="fbMessage" class="input" rows="4" placeholder="Texto da publicação"></textarea>
          <input id="fbLink" class="input" placeholder="Link do produto (opcional)">
          <button id="fbPublishText" class="btn">Publicar na Página</button>
          <div id="fbPublishOut"></div>
        </div>
        <div class="card">
          <h2>4. Publicar imagem</h2>
          <input id="fbImageUrl" class="input" placeholder="URL pública da imagem">
          <input id="fbImageCaption" class="input" placeholder="Legenda">
          <button id="fbPublishImage" class="btn">Publicar imagem</button>
          <div id="fbPublishImageOut"></div>
        </div>
        <div class="card">
          <h2>5. Segurança</h2>
          <p>O Orus não recebe permissão para anúncios, orçamento ou impulsionamento.</p>
          <span class="status ok-bg">● Sem gasto automático</span>
        </div>
        <div class="card">
          <h2>6. Conteúdo</h2>
          <p>O Marketing Studio poderá preparar o mesmo conteúdo para Facebook depois que a conexão estiver autorizada.</p>
          <button id="fbCreateContent" class="btn alt">Criar conteúdo</button>
        </div>
      </div>`;
    main.appendChild(panel);

    const integrations = document.querySelector('#integrations .integration-grid');
    if (integrations) {
      const card = document.createElement('div');
      card.className = 'card integration';
      card.innerHTML = '<h2>f Facebook</h2><span id="fbIntegrationStatus" class="status">Verificando...</span><button class="btn" onclick="window.orusFacebookOpen()">Abrir Facebook</button>';
      integrations.appendChild(card);
    }

    document.getElementById('fbConnect').onclick = connect;
    document.getElementById('fbPublishText').onclick = publishText;
    document.getElementById('fbPublishImage').onclick = publishImage;
    document.getElementById('fbCreateContent').onclick = () => {
      if (typeof window.studio === 'function') window.studio();
      setTimeout(() => { const s = document.getElementById('channel'); if (s && ![...s.options].some(o => o.value === 'FACEBOOK')) s.insertAdjacentHTML('beforeend', '<option value="FACEBOOK">FACEBOOK</option>'); if (s) s.value = 'FACEBOOK'; }, 50);
    };
    window.orusFacebookOpen = () => {
      if (typeof window.nav === 'function') window.nav('facebook');
      else { document.querySelectorAll('.panel').forEach(x => x.classList.remove('active')); panel.classList.add('active'); }
      loadStatus();
    };
    window.orusFacebookSelect = selectPage;

    const q = new URLSearchParams(location.search);
    if (q.get('facebook') === 'connected' || q.get('facebook') === 'error') {
      window.orusFacebookOpen();
      history.replaceState({}, '', location.pathname);
    }
    loadStatus();
  }

  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(mount, 500);
})();
