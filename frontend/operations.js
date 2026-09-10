(() => {
  const API = '/api/v1';
  const token = () => localStorage.getItem('mlai_token') || '';
  const call = async (path, opts = {}) => {
    opts.headers = { ...(opts.headers || {}), 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) };
    const r = await fetch(API + path, opts);
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  };
  const badge = (ok, label) => `<span class="status ${ok ? 'ok-bg' : 'warn'}">${ok ? '●' : '○'} ${label}</span>`;
  async function refresh() {
    const box = document.getElementById('opsCenter');
    if (!box) return;
    try {
      const [ml, tt, ig, pin] = await Promise.all([
        call('/marketplace/mercadolivre/status'),
        call('/marketplace/tiktok/status'),
        call('/marketplace/instagram/status'),
        call('/marketplace/pinterest/status'),
      ]);
      const automation = await fetch(API + '/automation/status', { headers: { 'x-automation-key': box.dataset.key || '' } }).then(r => r.ok ? r.json() : null).catch(() => null);
      box.querySelector('[data-status]').innerHTML = [
        badge(ml.connected, 'Mercado Livre'),
        badge(tt.connected, 'TikTok'),
        badge(ig.connected, 'Instagram'),
        badge(pin.connected, 'Pinterest'),
        badge(!!automation?.enabled, automation ? `Hunter ${automation.intervalHours}h` : 'Hunter protegido'),
      ].join(' ');
      box.querySelector('[data-detail]').textContent = ml.connected ? `ML sincronizado ${ml.lastSyncAt ? new Date(ml.lastSyncAt).toLocaleString() : 'aguardando sincronização'}.` : 'Mercado Livre precisa ser conectado pelo OAuth.';
    } catch (_) {}
  }
  function mount() {
    if (document.getElementById('opsCenter')) return;
    const home = document.getElementById('home');
    if (!home) return;
    const el = document.createElement('div');
    el.id = 'opsCenter';
    el.className = 'card safety';
    el.innerHTML = `<div style="width:100%"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><strong>⚙ Centro operacional</strong><p class="muted">Status real das integrações e execução do Product Hunter.</p></div><div data-status class="status-list"></div></div><div data-detail class="muted small" style="margin:10px 0">Verificando...</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-run>Executar Hunter agora</button><a class="btn alt" href="/media/test/tiktok.mp4" target="_blank" rel="noopener">Vídeo teste TikTok</a><a class="btn alt" href="https://www.mercadolivre.com.br/l/visite-o-portal-de-afiliados" target="_blank" rel="noopener">Central de Afiliados</a><button class="btn alt" data-refresh>Atualizar diagnóstico</button></div><p class="muted small" style="margin-top:10px">Links de afiliado precisam ser gerados pela Central/Barra de Afiliados do Mercado Livre e depois vinculados ao produto; o sistema não inventa nem falsifica atribuição.</p></div>`;
    home.appendChild(el);
    el.querySelector('[data-run]').onclick = async () => {
      try {
        const r = await call('/automation/run', { method: 'POST', headers: { 'x-automation-key': el.dataset.key || '' } });
        alert(r.ok ? 'Product Hunter executado com sucesso.' : 'Hunter já está em execução.');
        refresh();
      } catch (_) { alert('A execução automática está protegida e será feita pelo agendador.'); }
    };
    el.querySelector('[data-refresh]').onclick = refresh;
    refresh();
  }
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(mount, 500);
})();
