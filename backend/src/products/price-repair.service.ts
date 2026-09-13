import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PriceRepairService implements OnModuleInit {
  private readonly logger = new Logger(PriceRepairService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Do not block application startup. Repair legacy zero-price affiliate records shortly after boot.
    setTimeout(() => this.repairZeroPrices().catch((error: any) => {
      this.logger.warn(`Zero-price repair failed: ${error?.message || 'unknown error'}`);
    }), 1500);
  }

  private async repairZeroPrices() {
    const products = await this.prisma.product.findMany({
      where: { marketplace: 'MERCADOLIVRE', affiliateUrl: { not: null }, price: { lte: 0 } },
      select: { id: true, externalProductId: true, productUrl: true },
      take: 100,
    });

    let repaired = 0;
    for (const product of products) {
      const itemId = String(product.externalProductId || '').trim();
      if (!/^MLB\d{9,}$/i.test(itemId)) continue;
      try {
        const response = await axios.get(`https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'ML-Affiliate-AI/1.0' },
          timeout: 8000,
          proxy: false,
        });
        const item = response.data;
        const price = Number(item?.price);
        if (!Number.isFinite(price) || price <= 0) continue;
        const originalPrice = item?.original_price == null ? null : Number(item.original_price);
        const discountPercent = originalPrice && price > 0
          ? Math.max(0, ((originalPrice - price) / originalPrice) * 100)
          : 0;
        await this.prisma.product.update({
          where: { id: product.id },
          data: {
            price,
            originalPrice,
            discountPercent,
            currency: item?.currency_id || 'BRL',
            productUrl: item?.permalink || product.productUrl,
            availability: item?.available_quantity == null ? undefined : String(item.available_quantity),
          },
        });
        repaired++;
      } catch (error: any) {
        this.logger.debug(`Could not refresh price for ${itemId}: ${error?.response?.status || error?.message || 'unknown error'}`);
      }
    }

    if (products.length) this.logger.log(`Zero-price affiliate repair: checked=${products.length} repaired=${repaired}`);
  }
}
