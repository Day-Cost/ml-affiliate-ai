import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SafePendingService {
  constructor(private readonly prisma: PrismaService) {}

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
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });

    return products.map((product) => ({
      ...product,
      price: product.price == null ? null : Number(product.price),
      discountPercent: product.discountPercent == null ? 0 : Number(product.discountPercent),
    }));
  }
}
