import { Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { CryptoService } from '../crypto.service';

@Injectable()
export class ProductHunterService {
  constructor(private prisma: PrismaService, private scoring: ScoringService, private crypto: CryptoService) {}

  private async tokenForUser(userId?: string) {
    if (!userId) return null;
    const acc = await this.prisma.marketplaceAccount.findUnique({ where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } } });
    if (!acc) return null;
    if (acc.tokenExpiresAt && acc.tokenExpiresAt.getTime() < Date.now() + 60_000) return null;
    return this.crypto.decrypt(acc.accessTokenEncrypted);
  }

  async search(query: string, userId?: string) {
    if (!query.trim()) return { query, items: [] };
    const token = await this.tokenForUser(userId);
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const { data } = await axios.get('https://api.mercadolibre.com/sites/MLB/search', { params: { q: query.trim(), limit: 20 }, headers, timeout: 15000 });
    const items = await Promise.all((data.results || []).map(async (p: any) => {
      const price = Number(p.price || 0);
      const originalPrice = p.original_price ? Number(p.original_price) : null;
      const discount = originalPrice && price > 0 ? Math.max(0, ((originalPrice - price) / originalPrice) * 100) : 0;
      const rating = p.reviews?.rating_average != null ? Number(p.reviews.rating_average) : null;
      const reviewsCount = Number(p.reviews?.total || 0);
      const soldQuantity = Number(p.sold_quantity || 0);
      const demand = Math.min(100, soldQuantity > 0 ? 35 + Math.log10(soldQuantity + 1) * 20 : 35);
      const quality = rating == null ? 50 : Math.min(100, rating * 20);
      const content = Math.min(100, 55 + (p.pictures?.length || 0) * 5);
      const score = this.scoring.calculate({ demand, conversion: 50, commission: 50, discount: Math.min(100, discount), quality, competition: 50, trend: 50, content });
      const product = await this.prisma.product.upsert({
        where: { marketplace_externalProductId: { marketplace: 'MERCADOLIVRE', externalProductId: String(p.id) } },
        create: { marketplace: 'MERCADOLIVRE', externalProductId: String(p.id), title: String(p.title || ''), categoryId: p.category_id || null, price, originalPrice, discountPercent: discount, currency: p.currency_id || 'BRL', rating, reviewsCount, sellerId: p.seller?.id ? BigInt(p.seller.id) : null, sellerName: p.seller?.nickname || null, imageUrl: p.thumbnail || null, productUrl: p.permalink || null, availability: p.available_quantity != null ? String(p.available_quantity) : null },
        update: { title: String(p.title || ''), categoryId: p.category_id || null, price, originalPrice, discountPercent: discount, currency: p.currency_id || 'BRL', rating, reviewsCount, sellerId: p.seller?.id ? BigInt(p.seller.id) : null, sellerName: p.seller?.nickname || null, imageUrl: p.thumbnail || null, productUrl: p.permalink || null, availability: p.available_quantity != null ? String(p.available_quantity) : null },
      });
      await this.prisma.productScore.create({ data: { productId: product.id, score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content } });
      return { id: p.id, dbId: product.id, title: p.title, price, originalPrice, discountPercent: Number(discount.toFixed(2)), rating, reviewsCount, soldQuantity, thumbnail: p.thumbnail, permalink: p.permalink, affiliateUrl: product.affiliateUrl, score, dataQuality: { demand: soldQuantity > 0 ? 'REAL' : 'LIMITED', conversion: 'NOT_AVAILABLE', commission: product.affiliateUrl ? 'LINK_READY' : 'LINK_REQUIRED', trend: 'NOT_AVAILABLE', competition: 'ESTIMATE' } };
    }));
    return { query, total: data.paging?.total || items.length, items };
  }

  async searchForConnectedUser(query: string) {
    const acc = await this.prisma.marketplaceAccount.findFirst({ where: { marketplace: 'MERCADOLIVRE', status: 'CONNECTED' }, orderBy: { updatedAt: 'desc' } });
    if (!acc) throw new Error('MERCADO_LIVRE_NOT_CONNECTED');
    return this.search(query, acc.userId);
  }

  async top() {
    const products = await this.prisma.product.findMany({ include: { scores: { orderBy: { calculatedAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' }, take: 20 });
    return products.map(p => ({ ...p, latestScore: p.scores[0]?.score ?? null })).sort((a, b) => Number(b.latestScore || 0) - Number(a.latestScore || 0));
  }

  async setAffiliateUrl(productId: string, affiliateUrl: string) {
    const url = String(affiliateUrl || '').trim();
    if (!/^https:\/\//i.test(url)) throw new Error('AFFILIATE_URL_MUST_BE_HTTPS');
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');
    return this.prisma.product.update({ where: { id: productId }, data: { affiliateUrl: url } });
  }
}
