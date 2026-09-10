(() => {
  function mount() {
    document.querySelectorAll('#results .product').forEach(card => {
      if (card.querySelector('[data-video-product]')) return;
      const img = card.querySelector('.product-img'); const url = img?.src;
      if (!url || !url.includes('mlstatic.com')) return;
      const row = document.createElement('div'); row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
      const a = document.createElement('a'); a.className='btn alt'; a.dataset.videoProduct='1'; a.target='_blank'; a.rel='noopener'; a.textContent='Gerar vídeo 5s';
      a.href='/api/v1/media/generate/product.mp4?imageUrl='+encodeURIComponent(url); row.appendChild(a); card.appendChild(row);
    });
  }
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true}); setTimeout(mount,700);
})();
