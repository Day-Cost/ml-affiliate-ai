const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'price-repair.service.ts');
const replacement = `import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MercadoLivreService } from '../marketplace/mercadolivre.service';

@Injectable()
export class PriceRepairService implements OnModuleInit {
  private readonly logger = new Logger(PriceRepairService.name);

  constructor(private prisma: PrismaService, private mercadoLivre: MercadoLivreService) {}

  async onModuleInit() {
    setTimeout(() => this.repairZeroPrices().catch((error: any) => {
      this.logger.warn(\`Zero-price repair failed: \${error?.message || 'unknown error'}\`);
    }), 1500);
  }

  private async repairZeroPrices() {
    const products = await this.prisma.product.findMany({
      where: { marketplace: 'MERCADOLIVRE', affiliateUrl: { not: null }, price: { lte: 0 } },
      select: { id: true, externalProductId: true, title: true, productUrl: true },
      take: 100,
    });

    const account = await this.prisma.marketplaceAccount.findFirst({
      where: { marketplace: 'MERCADOLIVRE', status: 'CONNECTED' },
      orderBy: { updatedAt: 'desc' },
    });
    if (!account || !products.length) return;

    let repaired = 0;
    for (const product of products) {
      try {
        const search = await this.mercadoLivre.searchCatalog(account.userId, product.title);
        const match = (search?.results || []).find((x: any) => String(x?.id || '').toUpperCase() === String(product.externalProductId || '').toUpperCase());
        const fallback = match || (search?.results || [])[0];
        const price = Number(fallback?.price ?? fallback?.item?.price ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;

        const originalPrice = fallback?.original_price == null ? null : Number(fallback.original_price);
        const discountPercent = originalPrice && price > 0
          ? Math.max(0, ((originalPrice - price) / originalPrice) * 100)
          : 0;

        await this.prisma.product.update({
          where: { id: product.id },
          data: {
            price,
            originalPrice,
            discountPercent,
            currency: fallback?.currency_id || 'BRL',
            productUrl: fallback?.permalink || product.productUrl,
            availability: fallback?.available_quantity == null ? undefined : String(fallback.available_quantity),
          },
        });
        repaired++;
      } catch (error: any) {
        this.logger.debug(\`Could not refresh price for \${product.externalProductId}: \${error?.response?.status || error?.message || 'unknown error'}\`);
      }
    }

    this.logger.log(\`Zero-price affiliate repair: checked=\${products.length} repaired=\${repaired}\`);
  }
}
`;
fs.writeFileSync(file, replacement);
console.log('Price repair updated to avoid /items/{id}');
