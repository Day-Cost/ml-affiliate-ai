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
    const box = document.getElementById('opsCenter'); if (!box) return;
    try {
      const [ml, tt, ig, pin, automation] = await Promise.all([
        call('/marketplace/mercadolivre/status'), call('/marketplace/tiktok/status'), call('/marketplace/instagram/status'), call('/marketplace/pinterest/status'), call('/automation/status')
      ]);
      box.querySelector('[data-status]').innerHTML = [badge(ml.connected, 'Mercado Livre'), badge(tt.connected, 'TikTok'), badge(ig.connected, 'Instagram'), badge(pin.connected, 'Pinterest'), badge(!!automation?.enabled, `Hunter ${automation.intervalHours}h`)].join(' ');
      box.querySelector('[data-detail]').textContent = ml.connected ? `ML sincronizado ${ml.lastSyncAt ? new Date(ml.lastSyncAt).toLocaleString() : 'aguardando sincronização'}.` : 'Mercado Livre precisa ser conectado pelo OAuth.';
    } catch (_) {}
  }
  function mount() {
    if (document.getElementById('opsCenter')) return;
    const home = document.getElementById('home'); if (!home) return;
    const el = document.createElement('div'); el.id = 'opsCenter'; el.className = 'card safety';
    el.innerHTML = `<div style="width:100%"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><strong>⚙ Centro operacional</strong><p class="muted">Status real das integrações e execução do Product Hunter.</p></div><div data-status class="status-list"></div></div><div data-detail class="muted small" style="margin:10px 0">Verificando...</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-run>Executar Hunter agora</button><a class="btn alt" href="/media/test/tiktok.mp4" target="_blank" rel="noopener">Vídeo teste TikTok</a><a class="btn alt" href="https://www.mercadolivre.com.br/l/visite-o-portal-de-afiliados" target="_blank" rel="noopener">Central de Afiliados</a><button class="btn alt" data-refresh>Atualizar diagnóstico</button></div><p class="muted small" style="margin-top:10px">O sistema só distribui links de afiliado reais. O link precisa ser gerado pela Central/Barra de Afiliados do Mercado Livre e vinculado ao produto.</p></div>`;
    home.appendChild(el);
    el.querySelector('[data-run]').onclick = async () => { try { const r = await call('/automation/run', { method: 'POST' }); alert(r.ok ? 'Product Hunter executado.' : 'Hunter já está em execução.'); refresh(); } catch (_) { alert('Não foi possível executar agora. O agendador continuará ativo.'); } };
    el.querySelector('[data-refresh]').onclick = refresh; refresh();
  }
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(mount, 500);
})();
