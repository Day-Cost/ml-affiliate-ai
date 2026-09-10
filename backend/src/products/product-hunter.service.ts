import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { MercadoLivreService } from '../marketplace/mercadolivre.service';

@Injectable()
export class ProductHunterService {
  constructor(private prisma: PrismaService, private scoring: ScoringService, private mercadoLivre: MercadoLivreService) {}

  async search(query: string, userId?: string) {
    if (!query.trim()) return { query, items: [] };

    // Product discovery uses Mercado Livre's public catalog/search data. OAuth is
    // still required for affiliate-link release, but it must not block discovery.
    const request = async () => axios.get('https://api.mercadolibre.com/sites/MLB/search', {
      params: { q: query.trim(), status: 'active', limit: 20 },
      headers: { Accept: 'application/json', 'User-Agent': 'ML-Affiliate-AI/1.0' },
      timeout: 15000,
    });

    let data: any;
    try {
      data = (await request()).data;
    } catch (error: any) {
      const status = error?.response?.status;
      throw new UnauthorizedException(`MERCADO_LIVRE_SEARCH_FAILED_${status || 'NETWORK'}`);
    }

    const items = await Promise.all((data.results || []).map(async (p: any) => {
      let detail: any = p;
      try {
        detail = (await axios.get(`https://api.mercadolibre.com/items/${encodeURIComponent(p.id)}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'ML-Affiliate-AI/1.0' },
          timeout: 10000,
        })).data;
      } catch {}

      let catalog: any = {};
      if (detail.catalog_product_id) {
        try {
          catalog = (await axios.get(`https://api.mercadolibre.com/products/${encodeURIComponent(detail.catalog_product_id)}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'ML-Affiliate-AI/1.0' },
            timeout: 10000,
          })).data;
        } catch {}
      }

      const price = Number(detail.price ?? p.price ?? 0);
      const originalPrice = detail.original_price != null ? Number(detail.original_price) : null;
      const discount = originalPrice && price > 0 ? Math.max(0, ((originalPrice - price) / originalPrice) * 100) : 0;
      const rating = detail.reviews?.rating_average != null ? Number(detail.reviews.rating_average) : null;
      const reviewsCount = Number(detail.reviews?.total || 0);
      const soldQuantity = Number(detail.sold_quantity || p.sold_quantity || 0);
      const demand = Math.min(100, soldQuantity > 0 ? 35 + Math.log10(soldQuantity + 1) * 20 : 35);
      const quality = rating == null ? 50 : Math.min(100, rating * 20);
      const pictures = catalog.pictures || [];
      const content = Math.min(100, 55 + Math.max(pictures.length, Array.isArray(detail.pictures) ? detail.pictures.length : 0) * 5);
      const score = this.scoring.calculate({ demand, conversion: 50, commission: 50, discount: Math.min(100, discount), quality, competition: 50, trend: 50, content });
      const id = String(detail.id || p.id);
      const categoryId = detail.category_id || catalog.category_id || null;
      const categoryName = detail.domain_name || catalog.domain_name || null;
      const imageUrl = detail.thumbnail || detail.pictures?.[0]?.url || catalog.pictures?.[0]?.url || null;
      const productUrl = detail.permalink || p.permalink || null;
      const product = await this.prisma.product.upsert({
        where: { id: `ml-${id}` },
        create: { id: `ml-${id}`, marketplace: 'MERCADOLIVRE', externalProductId: id, title: String(detail.title || p.title || catalog.name || ''), categoryId, categoryName, price, originalPrice, discountPercent: discount, currency: detail.currency_id || 'BRL', rating, reviewsCount, sellerId: detail.seller_id ? BigInt(detail.seller_id) : null, sellerName: detail.seller?.nickname || null, imageUrl, productUrl, availability: detail.available_quantity != null ? String(detail.available_quantity) : null },
        update: { title: String(detail.title || p.title || catalog.name || ''), categoryId, categoryName, price, originalPrice, discountPercent: discount, currency: detail.currency_id || 'BRL', rating, reviewsCount, sellerId: detail.seller_id ? BigInt(detail.seller_id) : null, sellerName: detail.seller?.nickname || null, imageUrl, productUrl, availability: detail.available_quantity != null ? String(detail.available_quantity) : null }
      });
      await this.prisma.productScore.create({ data: { productId: product.id, score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content } });
      return { id: detail.id || p.id, dbId: product.id, title: detail.title || p.title || catalog.name, price, originalPrice, discountPercent: Number(discount.toFixed(2)), rating, reviewsCount, soldQuantity, thumbnail: imageUrl, permalink: productUrl, affiliateUrl: product.affiliateUrl, score, affiliateStatus: product.affiliateUrl ? 'ACTIVE' : 'PENDING', dataQuality: { demand: soldQuantity > 0 ? 'REAL' : 'LIMITED', conversion: 'NOT_AVAILABLE', commission: product.affiliateUrl ? 'LINK_READY' : 'LINK_REQUIRED', trend: 'NOT_AVAILABLE', competition: 'ESTIMATE' } };
    }));
    return { query, total: data.paging?.total || items.length, items };
  }

  async searchForConnectedUser(query: string) {
    const acc = await this.prisma.marketplaceAccount.findFirst({ where: { marketplace: 'MERCADOLIVRE', status: 'CONNECTED' }, orderBy: { updatedAt: 'desc' } });
    if (!acc) throw new Error('MERCADO_LIVRE_NOT_CONNECTED');
    return this.search(query, acc.userId);
  }

  async top() {
    const products = await this.prisma.product.findMany({ select: { id: true, title: true, price: true, originalPrice: true, discountPercent: true, imageUrl: true, productUrl: true, affiliateUrl: true, updatedAt: true, scores: { select: { score: true, calculatedAt: true }, orderBy: { calculatedAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' }, take: 20 });
    return products.map(p => ({ id: p.id, title: p.title, price: Number(p.price || 0), originalPrice: p.originalPrice == null ? null : Number(p.originalPrice), discountPercent: Number(p.discountPercent || 0), imageUrl: p.imageUrl, productUrl: p.productUrl, affiliateUrl: p.affiliateUrl, affiliateStatus: p.affiliateUrl ? 'ACTIVE' : 'PENDING', updatedAt: p.updatedAt, latestScore: p.scores[0]?.score ?? null })).sort((a, b) => Number(b.latestScore || 0) - Number(a.latestScore || 0));
  }

  async pendingAffiliateLinks() { return this.prisma.product.findMany({ where: { marketplace: 'MERCADOLIVRE', affiliateUrl: null, productUrl: { not: null } }, select: { id: true, externalProductId: true, title: true, price: true, discountPercent: true, imageUrl: true, productUrl: true, categoryId: true, categoryName: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }], take: 200 }); }

  async setAffiliateUrl(productId: string, affiliateUrl: string, userId?: string) {
    const url = String(affiliateUrl || '').trim();
    if (!/^https:\/\/meli\.la\/[A-Za-z0-9]+$/i.test(url)) throw new Error('AFFILIATE_URL_MUST_BE_OFFICIAL_MELI_SHORT_LINK');
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');
    const updated = await this.prisma.product.update({ where: { id: productId }, data: { affiliateUrl: url } });
    if (userId) await this.createMarketingQueue(userId, updated);
    return { ...updated, affiliateStatus: 'ACTIVE', marketing: 'QUEUED', storefront: 'ACTIVE' };
  }

  private async createMarketingQueue(userId: string, product: any) {
    const channels = [
      { channel: 'WEB', type: 'POST', publishMode: 'AUTO' },
      { channel: 'TIKTOK', type: 'VIDEO_SCRIPT', publishMode: 'MANUAL' },
      { channel: 'INSTAGRAM', type: 'POST', publishMode: 'MANUAL' },
      { channel: 'PINTEREST', type: 'POST', publishMode: 'MANUAL' },
    ];
    for (const item of channels) {
      const exists = await this.prisma.marketingContent.findFirst({ where: { userId, productId: product.id, channel: item.channel, status: { in: ['DRAFT', 'APPROVED', 'PUBLISHED'] } } });
      if (exists) continue;
      const title = product.title;
      const caption = `Confira ${title}. ${product.discountPercent ? `Desconto de ${Number(product.discountPercent).toFixed(0)}%. ` : ''}Acesse pelo link oficial de afiliado: ${product.affiliateUrl}`;
      const script = `Gancho: ${title}.\nMostre os principais benefícios reais do produto.\nOferta: apresente preço e desconto somente quando confirmados.\nCTA: acesse pelo link oficial de afiliado.`;
      await this.prisma.marketingContent.create({ data: { userId, productId: product.id, channel: item.channel, contentType: item.type, title, caption, script: item.channel === 'TIKTOK' ? script : null, affiliateUrl: product.affiliateUrl, aiGenerated: false, status: 'DRAFT', publishMode: item.publishMode } });
    }
  }
}
