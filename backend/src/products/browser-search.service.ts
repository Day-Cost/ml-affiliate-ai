import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ScoringService } from '../scoring/scoring.service';

@Injectable()
export class BrowserSearchService {
  constructor(private prisma: PrismaService, private scoring: ScoringService) {}

  async importPublicResults(userId: string, results: any[]) {
    const imported: any[] = [];
    for (const p of Array.isArray(results) ? results.slice(0, 20) : []) {
      const id = String(p?.id || '').trim();
      const productUrl = String(p?.permalink || '').trim();
      if (!id || !productUrl || !productUrl.startsWith('https://')) continue;

      const price = Number(p?.price || 0);
      const originalPrice = p?.original_price == null ? null : Number(p.original_price);
      const discount = originalPrice && price > 0 ? Math.max(0, ((originalPrice - price) / originalPrice) * 100) : 0;
      const soldQuantity = p?.sold_quantity == null ? null : Number(p.sold_quantity);
      const rating = p?.reviews?.rating_average == null ? null : Number(p.reviews.rating_average);
      const reviewsCount = Number(p?.reviews?.total || 0);
      const demand = soldQuantity == null ? 35 : Math.min(100, soldQuantity > 0 ? 35 + Math.log10(soldQuantity + 1) * 20 : 25);
      const quality = rating == null ? 50 : Math.min(100, rating * 20);
      const pictures = Array.isArray(p?.pictures) ? p.pictures.length : (p?.thumbnail ? 1 : 0);
      const content = Math.min(100, 55 + pictures * 5);
      const score = this.scoring.calculate({ demand, conversion: 50, commission: 50, discount: Math.min(100, discount), quality, competition: 50, trend: 50, content });
      const sellerId = p?.seller?.id ?? p?.seller_id ?? null;

      const product = await this.prisma.product.upsert({
        where: { marketplace_externalProductId: { marketplace: 'MERCADOLIVRE', externalProductId: id } },
        create: {
          id: `ml-${id}`,
          marketplace: 'MERCADOLIVRE',
          externalProductId: id,
          title: String(p?.title || 'Produto Mercado Livre'),
          categoryId: p?.category_id || null,
          price,
          originalPrice,
          discountPercent: discount,
          currency: p?.currency_id || 'BRL',
          rating,
          reviewsCount,
          soldQuantity,
          sellerId: sellerId == null ? null : BigInt(sellerId),
          imageUrl: p?.thumbnail || p?.pictures?.[0]?.secure_url || p?.pictures?.[0]?.url || null,
          productUrl,
          affiliateUrl: null,
          availability: p?.available_quantity == null ? null : String(p.available_quantity),
        },
        update: {
          title: String(p?.title || 'Produto Mercado Livre'),
          categoryId: p?.category_id || null,
          price,
          originalPrice,
          discountPercent: discount,
          currency: p?.currency_id || 'BRL',
          rating,
          reviewsCount,
          soldQuantity,
          sellerId: sellerId == null ? null : BigInt(sellerId),
          imageUrl: p?.thumbnail || p?.pictures?.[0]?.secure_url || p?.pictures?.[0]?.url || null,
          productUrl,
          availability: p?.available_quantity == null ? null : String(p.available_quantity),
        },
      });

      await this.prisma.productScore.create({ data: { productId: product.id, score, demand, conversion: 50, commission: product.affiliateUrl ? 50 : 50, discount, quality, competition: 50, trend: 50, content } });
      imported.push({
        id,
        dbId: product.id,
        title: product.title,
        price,
        originalPrice,
        discountPercent: Number(discount.toFixed(2)),
        rating,
        reviewsCount,
        soldQuantity,
        thumbnail: product.imageUrl,
        permalink: productUrl,
        affiliateUrl: product.affiliateUrl,
        score,
        affiliateStatus: product.affiliateUrl ? 'ACTIVE' : 'PENDING',
        dataQuality: { demand: soldQuantity != null ? 'REAL' : 'LIMITED', conversion: 'NOT_AVAILABLE', commission: product.affiliateUrl ? 'LINK_READY' : 'LINK_REQUIRED', trend: 'NOT_AVAILABLE', competition: 'ESTIMATE' },
      });
    }
    return { userId, total: imported.length, items: imported };
  }
}
