import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma.service';

@Controller('store')
export class StorefrontController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async home(@Res() res: Response) {
    const products = await this.prisma.product.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: { scores: { orderBy: { calculatedAt: 'desc' }, take: 1 } },
    });
    const cards = products.map((p) => this.card(p)).join('');
    return res.type('html').send(this.page('Ofertas selecionadas por IA', `<header><h1>ML Affiliate AI</h1><p>Produtos analisados e selecionados automaticamente.</p></header><main class="grid">${cards || '<p>Ainda estamos analisando produtos. Volte em breve.</p>'}</main>`));
  }

  @Get('products/:id')
  async product(@Param('id') id: string, @Res() res: Response) {
    const p = await this.prisma.product.findUnique({ where: { id }, include: { scores: { orderBy: { calculatedAt: 'desc' }, take: 1 } } });
    if (!p) throw new NotFoundException('PRODUCT_NOT_FOUND');
    const price = p.price ? `R$ ${Number(p.price).toFixed(2)}` : 'Consultar preço';
    const discount = p.discountPercent ? `${Number(p.discountPercent).toFixed(0)}% de desconto` : '';
    const target = p.affiliateUrl || p.productUrl;
    const button = target ? `<a class="button" href="/go/${p.id}">Ver oferta</a>` : '<span>Link indisponível</span>';
    return res.type('html').send(this.page(p.title, `<article class="product"><img src="${this.escape(p.imageUrl || '')}" alt="${this.escape(p.title)}"><h1>${this.escape(p.title)}</h1><p class="price">${price}</p><p>${discount}</p><p>Oferta encontrada e analisada pelo ML Affiliate AI. Preço e disponibilidade devem ser confirmados no Mercado Livre.</p>${button}</article>`));
  }

  @Get('go/:id')
  async go(@Param('id') id: string, @Res() res: Response) {
    const p = await this.prisma.product.findUnique({ where: { id }, select: { affiliateUrl: true, productUrl: true } });
    if (!p) throw new NotFoundException('PRODUCT_NOT_FOUND');
    const target = p.affiliateUrl || p.productUrl;
    if (!target || !/^https:\/\/(www\.)?mercadolivre\.com\.br\//i.test(target)) throw new NotFoundException('SAFE_LINK_UNAVAILABLE');
    return res.redirect(302, target);
  }

  private card(p: any) {
    const score = p.scores?.[0]?.score != null ? Number(p.scores[0].score).toFixed(0) : '—';
    return `<a class="card" href="/store/products/${p.id}"><img src="${this.escape(p.imageUrl || '')}" alt="${this.escape(p.title)}"><h2>${this.escape(p.title)}</h2><strong>${p.price ? `R$ ${Number(p.price).toFixed(2)}` : 'Consultar'}</strong><small>Score ${score}</small></a>`;
  }

  private page(title: string, body: string) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${this.escape(title)}</title><meta name="description" content="Ofertas selecionadas e analisadas pelo ML Affiliate AI"><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:1100px;margin:auto;padding:24px;background:#fafafa;color:#171717}header{margin-bottom:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card,.product{background:#fff;border-radius:16px;padding:16px;text-decoration:none;color:inherit;box-shadow:0 2px 12px #0001}.card img,.product img{width:100%;height:220px;object-fit:contain}.card h2{font-size:16px;min-height:42px}.card small{display:block;margin-top:8px}.price{font-size:28px;font-weight:700}.button{display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none}</style></head><body>${body}<footer><p>Os preços e condições são confirmados no Mercado Livre.</p></footer></body></html>`;
  }

  private escape(value: string) { return String(value).replace(/[&<>\"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' } as any)[c]); }
}
