import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma.service';

@Controller()
export class StorefrontController {
  constructor(private prisma: PrismaService) {}

  @Get('store')
  async home(@Res() res: Response) {
    const products = await this.prisma.product.findMany({ where: { affiliateUrl: { not: null } }, orderBy: { updatedAt: 'desc' }, take: 30, include: { scores: { orderBy: { calculatedAt: 'desc' }, take: 1 } } });
    const safeProducts = products.filter((p) => this.isOfficialAffiliateUrl(p.affiliateUrl));
    const cards = safeProducts.map((p) => this.card(p)).join('');
    return res.type('html').send(this.page('Ofertas selecionadas por IA', `<header><h1>ML Affiliate AI</h1><p>Produtos analisados e selecionados automaticamente.</p></header><main class="grid">${cards || '<p>Ainda estamos analisando produtos com links de afiliado. Volte em breve.</p>'}</main>`));
  }

  @Get('store/products/:id')
  async product(@Param('id') id: string, @Res() res: Response) {
    const p = await this.prisma.product.findUnique({ where: { id }, include: { scores: { orderBy: { calculatedAt: 'desc' }, take: 1 } } });
    if (!p || !this.isOfficialAffiliateUrl(p.affiliateUrl)) throw new NotFoundException('AFFILIATE_PRODUCT_NOT_AVAILABLE');
    const price = p.price ? `R$ ${Number(p.price).toFixed(2)}` : 'Consultar preço';
    const discount = p.discountPercent ? `${Number(p.discountPercent).toFixed(0)}% de desconto` : '';
    return res.type('html').send(this.page(p.title, `<article class="product"><img src="${this.escape(p.imageUrl || '')}" alt="${this.escape(p.title)}"><h1>${this.escape(p.title)}</h1><p class="price">${price}</p><p>${discount}</p><p>Oferta encontrada e analisada pelo ML Affiliate AI. Preço e disponibilidade devem ser confirmados no Mercado Livre.</p><a class="button" href="/go/${p.id}" rel="nofollow sponsored">Ver oferta</a></article>`));
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

  private isOfficialAffiliateUrl(value: string | null | undefined) { return Boolean(value && /^https:\/\/meli\.la\/[A-Za-z0-9]+$/i.test(value.trim())); }
  private card(p: any) { const score = p.scores?.[0]?.score != null ? Number(p.scores[0].score).toFixed(0) : '—'; return `<a class="card" href="/store/products/${p.id}"><img src="${this.escape(p.imageUrl || '')}" alt="${this.escape(p.title)}"><h2>${this.escape(p.title)}</h2><strong>${p.price ? `R$ ${Number(p.price).toFixed(2)}` : 'Consultar'}</strong><small>Score ${score}</small></a>`; }
  private page(title: string, body: string) { return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${this.escape(title)}</title><meta name="description" content="ML Affiliate AI"><meta name="robots" content="index,follow"><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:1100px;margin:auto;padding:24px;background:#fafafa;color:#171717;line-height:1.6}.legal{max-width:800px;margin:auto;background:#fff;padding:28px;border-radius:16px;box-shadow:0 2px 12px #0001}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card,.product{background:#fff;border-radius:16px;padding:16px;text-decoration:none;color:inherit;box-shadow:0 2px 12px #0001}.card img,.product img{width:100%;height:220px;object-fit:contain}.card h2{font-size:16px;min-height:42px}.card small{display:block;margin-top:8px}.price{font-size:28px;font-weight:700}.button{display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none}</style></head><body>${body}<footer><p>ML Affiliate AI · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p></footer></body></html>`; }
  private escape(value: string) { return String(value).replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' } as any)[c]); }
  private escapeXml(value: string) { return this.escape(value); }
}
