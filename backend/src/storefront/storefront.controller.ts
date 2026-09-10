import { Controller, Get, Param, Query, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma.service';

@Controller()
export class StorefrontController {
  constructor(private prisma: PrismaService) {}

  @Get('store')
  async home(@Query('category') category: string, @Res() res: Response) {
    const products = await this.prisma.product.findMany({
      where: { affiliateUrl: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: { scores: { orderBy: { calculatedAt: 'desc' }, take: 1 } },
    });
    const safeProducts = products.filter((p) => this.isOfficialAffiliateUrl(p.affiliateUrl));
    const categories = this.buildCategories(safeProducts);
    const selected = String(category || '').trim();
    const filtered = selected ? safeProducts.filter((p) => this.categoryFor(p) === selected) : safeProducts;
    const featured = [...filtered].sort((a: any, b: any) => Number(b.scores?.[0]?.score || 0) - Number(a.scores?.[0]?.score || 0)).slice(0, 8);
    const rest = filtered.filter((p) => !featured.some((f) => f.id === p.id));
    const body = `
      <div class="topbar"><div class="container topbar-in"><strong>ML Affiliate AI</strong><span>Ofertas selecionadas por dados e IA</span></div></div>
      <header class="hero"><div class="container hero-in"><div><div class="eyebrow">LOJA DE OFERTAS</div><h1>Encontre produtos por categoria</h1><p>Produtos analisados automaticamente. Só entram aqui ofertas com link oficial de afiliado confirmado.</p><div class="hero-actions"><a class="button primary" href="/store">Ver todas as ofertas</a><a class="button secondary" href="#categorias">Explorar categorias</a></div></div><div class="hero-box"><b>Compra segura</b><span>Você será encaminhado ao Mercado Livre pelo link oficial de afiliado.</span></div></div></header>
      <main class="container">
        <section id="categorias" class="section"><div class="section-head"><div><div class="eyebrow">CATEGORIAS</div><h2>Compre por área</h2></div><span class="muted">${safeProducts.length} ofertas disponíveis</span></div><div class="category-grid"><a class="category ${!selected ? 'selected' : ''}" href="/store"><b>✨ Todas</b><small>${safeProducts.length} produtos</small></a>${categories.map(c => `<a class="category ${selected === c.name ? 'selected' : ''}" href="/store?category=${encodeURIComponent(c.name)}"><b>${this.escape(c.icon)} ${this.escape(c.name)}</b><small>${c.count} produtos</small></a>`).join('')}</div></section>
        ${featured.length ? `<section class="section"><div class="section-head"><div><div class="eyebrow">DESTAQUES</div><h2>${selected ? this.escape(selected) : 'Melhores oportunidades'}</h2></div><span class="muted">Ordenados pelo score</span></div><div class="product-grid">${featured.map((p) => this.card(p)).join('')}</div></section>` : ''}
        ${rest.length ? `<section class="section"><div class="section-head"><div><div class="eyebrow">CATÁLOGO</div><h2>Mais produtos</h2></div></div><div class="product-grid">${rest.map((p) => this.card(p)).join('')}</div></section>` : ''}
        ${!filtered.length ? `<section class="empty"><h2>Nenhuma oferta nesta categoria ainda</h2><p>O sistema adicionará automaticamente produtos quando houver link oficial de afiliado confirmado.</p><a class="button primary" href="/store">Voltar para todas</a></section>` : ''}
      </main>`;
    return res.type('html').send(this.page(selected ? `${selected} — ML Affiliate AI` : 'Loja — ML Affiliate AI', body));
  }

  @Get('store/products/:id')
  async product(@Param('id') id: string, @Res() res: Response) {
    const p = await this.prisma.product.findUnique({ where: { id }, include: { scores: { orderBy: { calculatedAt: 'desc' }, take: 1 } } });
    if (!p || !this.isOfficialAffiliateUrl(p.affiliateUrl)) throw new NotFoundException('AFFILIATE_PRODUCT_NOT_AVAILABLE');
    const price = p.price ? `R$ ${Number(p.price).toFixed(2)}` : 'Consultar preço';
    const discount = p.discountPercent ? `${Number(p.discountPercent).toFixed(0)}% de desconto` : '';
    const category = this.categoryFor(p);
    const body = `<main class="container detail"><a class="back" href="/store">← Voltar para a loja</a><div class="detail-grid"><div class="detail-image"><img src="${this.escape(p.imageUrl || '')}" alt="${this.escape(p.title)}"></div><article><span class="tag">${this.escape(category)}</span><h1>${this.escape(p.title)}</h1><div class="price">${price}</div>${discount ? `<div class="discount">${this.escape(discount)}</div>` : ''}<p class="muted">Oferta analisada pelo ML Affiliate AI. Preço e disponibilidade devem ser confirmados no Mercado Livre.</p><a class="button primary big" href="/go/${p.id}" rel="nofollow sponsored">Ver oferta no Mercado Livre →</a><p class="fine">Este botão usa o link oficial de afiliado confirmado para este produto.</p></article></div></main>`;
    return res.type('html').send(this.page(p.title, body));
  }

  @Get('go/:id')
  async go(@Param('id') id: string, @Res() res: Response) {
    const p = await this.prisma.product.findUnique({ where: { id }, select: { affiliateUrl: true } });
    if (!this.isOfficialAffiliateUrl(p?.affiliateUrl)) throw new NotFoundException('SAFE_AFFILIATE_LINK_UNAVAILABLE');
    return res.redirect(302, p!.affiliateUrl!);
  }

  @Get('privacy')
  privacy(@Res() res: Response) { return res.type('html').send(this.page('Política de Privacidade — ML Affiliate AI', `<article class="legal"><h1>Política de Privacidade</h1><p><strong>Última atualização: 10 de setembro de 2026.</strong></p><p>Esta Política de Privacidade explica como o ML Affiliate AI trata informações quando você utiliza nossa aplicação, site e integrações autorizadas com plataformas de terceiros.</p><h2>1. Dados tratados</h2><p>Podemos tratar dados de conta e autenticação necessários para operar integrações autorizadas, identificadores técnicos, informações de produtos, dados de desempenho e registros de ações realizadas na plataforma. Não solicitamos senhas das contas conectadas.</p><h2>2. Integrações com terceiros</h2><p>Quando você autoriza uma integração, o ML Affiliate AI utiliza somente os dados e permissões concedidos pela respectiva plataforma e pelas APIs oficiais. Os tokens de acesso são armazenados de forma protegida e usados para as funções autorizadas.</p><h2>3. Segurança</h2><p>Adotamos medidas técnicas e organizacionais para proteger credenciais, tokens e informações processadas. Ações financeiras permanecem sujeitas a controle e aprovação do usuário.</p><h2>4. Contato</h2><p>Para questões sobre privacidade ou tratamento de dados, entre em contato pelo endereço de suporte informado no aplicativo.</p></article>`)); }

  @Get('terms')
  terms(@Res() res: Response) { return res.type('html').send(this.page('Termos de Serviço — ML Affiliate AI', `<article class="legal"><h1>Termos de Serviço</h1><p><strong>Última atualização: 10 de setembro de 2026.</strong></p><h2>1. Uso da plataforma</h2><p>O usuário deve utilizar a plataforma de acordo com a legislação aplicável, estes termos e as regras das plataformas integradas.</p><h2>2. Integrações</h2><p>O ML Affiliate AI utiliza APIs oficiais e fluxos de autorização das plataformas integradas. Não solicitamos senhas de contas de terceiros.</p><h2>3. Conteúdo</h2><p>A plataforma pode criar e distribuir conteúdo autorizado somente quando houver os dados e permissões necessários.</p><h2>4. Ações financeiras</h2><p>A plataforma não autoriza automaticamente gastos, pagamentos, alterações de preço, aumentos de orçamento, anúncios pagos ou outras ações financeiras sensíveis sem aprovação expressa quando exigida pelo sistema.</p></article>`)); }

  @Get('robots.txt')
  robots(@Res() res: Response) { const base = process.env.APP_URL || ''; return res.type('text/plain').send(`User-agent: *\nAllow: /store\nAllow: /store/products/\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`); }

  @Get('sitemap.xml')
  async sitemap(@Res() res: Response) {
    const base = process.env.APP_URL || '';
    const products = await this.prisma.product.findMany({ where: { affiliateUrl: { not: null } }, select: { id: true, updatedAt: true, affiliateUrl: true }, take: 5000, orderBy: { updatedAt: 'desc' } });
    const safeProducts = products.filter((p) => this.isOfficialAffiliateUrl(p.affiliateUrl));
    const urls = [`<url><loc>${this.escapeXml(`${base}/store`)}</loc></url>`, ...safeProducts.map((p) => `<url><loc>${this.escapeXml(`${base}/store/products/${p.id}`)}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod></url>`)].join('');
    return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  }

  private categoryFor(p: any) {
    const text = `${p.categoryId || ''} ${p.title || ''}`.toLowerCase();
    if (/auto|carro|veículo|freio|pastilha|suspens|amortec|embreag|motor|transmiss|injeção|ignição|bateria autom|filtro autom|farol|lanterna|retrovisor|pneu|roda|engate|reboque|som autom/.test(text)) return 'Automotivo';
    if (/celular|smartphone|iphone|android|tablet|notebook|computador|monitor|teclado|mouse|informática/.test(text)) return 'Eletrônicos';
    if (/fone|headset|bluetooth|caixa de som|áudio|microfone/.test(text)) return 'Áudio';
    if (/tv|televis|streaming|videogame|playstation|xbox|nintendo|console/.test(text)) return 'Games & Entretenimento';
    if (/air fryer|geladeira|fogão|micro-ondas|cafeteira|liquidificador|eletrodomést/.test(text)) return 'Eletrodomésticos';
    if (/cozinha|panela|talher|utensílio|garrafa|organizador|casa/.test(text)) return 'Casa & Cozinha';
    if (/beleza|maquiagem|perfume|cabelo|skin|creme|cosmético/.test(text)) return 'Beleza';
    if (/fitness|academia|corrida|treino|suplement|yoga|bicicleta/.test(text)) return 'Fitness';
    if (/roupa|vestido|camisa|calça|tênis|sapato|moda/.test(text)) return 'Moda';
    if (/ferramenta|parafusadeira|furadeira|oficina/.test(text)) return 'Ferramentas';
    if (/bebê|infantil|brinquedo|criança/.test(text)) return 'Infantil';
    return 'Outros';
  }

  private buildCategories(products: any[]) {
    const icons: Record<string, string> = { 'Automotivo':'🚗', 'Eletrônicos':'📱', 'Áudio':'🎧', 'Games & Entretenimento':'🎮', 'Eletrodomésticos':'🏠', 'Casa & Cozinha':'🍳', 'Beleza':'💄', 'Fitness':'🏋️', 'Moda':'👕', 'Ferramentas':'🛠️', 'Infantil':'🧸', 'Outros':'📦' };
    const counts = new Map<string, number>();
    for (const p of products) counts.set(this.categoryFor(p), (counts.get(this.categoryFor(p)) || 0) + 1);
    return [...counts.entries()].sort((a,b) => b[1] - a[1]).map(([name,count]) => ({ name, count, icon: icons[name] || '📦' }));
  }

  private isOfficialAffiliateUrl(value: string | null | undefined) { return Boolean(value && /^https:\/\/meli\.la\/[A-Za-z0-9]+$/i.test(value.trim())); }
  private card(p: any) {
    const score = p.scores?.[0]?.score != null ? Number(p.scores[0].score).toFixed(0) : '—';
    const discount = Number(p.discountPercent || 0);
    return `<a class="product-card" href="/store/products/${p.id}"><div class="product-image"><img src="${this.escape(p.imageUrl || '')}" alt="${this.escape(p.title)}"></div><div class="product-info"><span class="tag">${this.escape(this.categoryFor(p))}</span><h3>${this.escape(p.title)}</h3><div class="price-row"><strong>${p.price ? `R$ ${Number(p.price).toFixed(2)}` : 'Consultar'}</strong>${discount > 0 ? `<span class="discount">-${discount.toFixed(0)}%</span>` : ''}</div><small>Score ${score} · Oferta com afiliado ativo</small></div></a>`;
  }
  private page(title: string, body: string) { return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${this.escape(title)}</title><meta name="description" content="Ofertas selecionadas pelo ML Affiliate AI"><meta name="robots" content="index,follow"><style>
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f6f8;color:#1f2937;line-height:1.5}.container{max-width:1180px;margin:auto;padding:0 22px}.topbar{background:#ffe600;border-bottom:1px solid #e5cf00}.topbar-in{min-height:58px;display:flex;align-items:center;justify-content:space-between;gap:20px}.topbar strong{font-size:20px}.topbar span{font-size:13px}.hero{background:linear-gradient(135deg,#fff 0,#fffbe0 100%);border-bottom:1px solid #e5e7eb}.hero-in{min-height:280px;padding-top:45px;padding-bottom:40px;display:flex;justify-content:space-between;align-items:center;gap:35px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6b7280}.hero h1{font-size:38px;line-height:1.1;margin:8px 0 12px;color:#111827}.hero p{max-width:680px;color:#4b5563}.hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.hero-box{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:22px;max-width:260px;box-shadow:0 8px 30px #0000000d}.hero-box b,.hero-box span{display:block}.hero-box span{font-size:13px;color:#6b7280;margin-top:7px}.button{display:inline-block;text-decoration:none;border-radius:10px;padding:11px 17px;font-weight:700}.button.primary{background:#3483fa;color:#fff}.button.secondary{background:#fff;color:#111827;border:1px solid #d1d5db}.button.big{padding:14px 22px;font-size:16px}.section{padding:30px 0}.section-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:16px}.section h2{margin:5px 0 0;font-size:25px}.muted{color:#6b7280}.category-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.category{background:#fff;border:1px solid #e5e7eb;border-radius:13px;padding:15px;text-decoration:none;color:#111827}.category.selected{border-color:#3483fa;box-shadow:0 0 0 2px #3483fa22}.category b,.category small{display:block}.category small{font-size:12px;color:#6b7280;margin-top:4px}.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}.product-card{background:#fff;border-radius:14px;border:1px solid #e5e7eb;text-decoration:none;color:inherit;overflow:hidden;transition:transform .15s,box-shadow .15s}.product-card:hover{transform:translateY(-2px);box-shadow:0 10px 30px #00000012}.product-image{height:220px;background:#fff;display:flex;align-items:center;justify-content:center;padding:15px}.product-image img{width:100%;height:100%;object-fit:contain}.product-info{padding:15px}.product-info h3{font-size:15px;line-height:1.35;margin:8px 0 12px;min-height:41px}.tag{display:inline-block;background:#f3f4f6;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;color:#4b5563}.price-row{display:flex;align-items:center;gap:9px}.price-row strong{font-size:20px}.discount{color:#168a45;font-weight:800;font-size:12px}.product-info small{display:block;color:#6b7280;margin-top:9px}.empty{background:#fff;border:1px dashed #d1d5db;border-radius:16px;padding:50px;text-align:center;margin:35px 0}.detail{padding-top:35px;padding-bottom:60px}.back{color:#3483fa;text-decoration:none;font-weight:700}.detail-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,1fr);gap:45px;margin-top:25px;background:#fff;border-radius:18px;padding:30px}.detail-image{min-height:430px;display:flex;align-items:center;justify-content:center}.detail-image img{width:100%;height:430px;object-fit:contain}.detail h1{font-size:31px;line-height:1.2}.detail .price{font-size:34px;font-weight:800;margin:20px 0 5px}.detail .discount{font-size:16px;margin-bottom:20px}.fine{font-size:12px;color:#6b7280;margin-top:12px}.legal{max-width:800px;margin:40px auto;background:#fff;padding:30px;border-radius:16px}.legal h1{margin-top:0}@media(max-width:760px){.topbar-in{padding-top:10px;padding-bottom:10px;align-items:flex-start;flex-direction:column;gap:2px}.hero-in{display:block}.hero h1{font-size:30px}.hero-box{max-width:none;margin-top:20px}.detail-grid{grid-template-columns:1fr;padding:18px}.detail-image,.detail-image img{height:300px;min-height:300px}.section-head{align-items:flex-start;flex-direction:column}}
  </style></head><body>${body}<footer class="container" style="padding-top:25px;padding-bottom:35px;color:#6b7280;font-size:12px">ML Affiliate AI · <a href="/privacy">Privacidade</a> · <a href="/terms">Termos</a></footer></body></html>`; }
  private escape(value: string) { return String(value).replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' } as any)[c]); }
  private escapeXml(value: string) { return this.escape(value); }
}
