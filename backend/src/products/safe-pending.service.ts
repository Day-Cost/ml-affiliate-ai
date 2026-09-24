import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SafePendingService {
  constructor(private readonly prisma: PrismaService) {}

  private directItemUrl(externalProductId: string, fallback: string | null) {
    const id = String(externalProductId || '').trim().toUpperCase();
    const source = String(fallback || '').trim();
    if (/\/p\/|\/up\//i.test(source)) return null;
    if (!/^MLB\d+$/.test(id)) return null;
    return `https://produto.mercadolivre.com.br/MLB-${id.slice(3)}`;
  }

  async list() {
    const products = await this.prisma.product.findMany({
      where: {
        marketplace: 'MERCADOLIVRE',
        affiliateUrl: null,
        productUrl: { not: null },
      },
      select: {
        id: true,
        externalProductId: true,
        title: true,
        price: true,
        discountPercent: true,
        soldQuantity: true,
        imageUrl: true,
        productUrl: true,
        categoryId: true,
        categoryName: true,
        updatedAt: true,
        scores: { select: { score: true }, orderBy: { calculatedAt: 'desc' }, take: 1 },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });

    return products
      .map((product) => {
        const productUrl = this.directItemUrl(product.externalProductId, product.productUrl);
        const price = product.price == null ? null : Number(product.price);
        if (!productUrl || price == null || price <= 0) return null;

        const latestScore = product.scores[0]?.score == null ? null : Number(product.scores[0].score);
        const soldQuantity = product.soldQuantity == null ? null : Number(product.soldQuantity);
        const salesSignal = soldQuantity == null ? 0 : Math.min(100, soldQuantity > 0 ? 35 + Math.log10(soldQuantity + 1) * 20 : 25);
        const priorityScore = Math.round(((latestScore ?? 50) * 0.65 + salesSignal * 0.35) * 100) / 100;
        return {
          id: product.id,
          externalProductId: product.externalProductId,
          title: product.title,
          price,
          discountPercent: product.discountPercent == null ? 0 : Number(product.discountPercent),
          soldQuantity,
          imageUrl: product.imageUrl,
          productUrl,
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          updatedAt: product.updatedAt,
          latestScore,
          salesSignal: Math.round(salesSignal * 100) / 100,
          priorityScore,
          affiliateStatus: 'PENDING',
          linkTarget: 'DIRECT_MERCADO_LIVRE_ITEM',
        };
      })
      .filter((product): product is NonNullable<typeof product> => product !== null)
      .sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
        return (b.soldQuantity ?? -1) - (a.soldQuantity ?? -1);
      });
  }
}
