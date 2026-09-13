const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'product-hunter.service.ts');
let text = fs.readFileSync(file, 'utf8');

if (!text.includes('async setAffiliateUrlByExternalId(')) {
  const marker = '  private async createMarketingQueue(userId: string, product: any) {';
  const index = text.indexOf(marker);
  if (index < 0) throw new Error('AFFILIATE_ROUTE_INSERT_MARKER_NOT_FOUND');
  const method = `  async setAffiliateUrlByExternalId(externalProductId: string, affiliateUrl: string, userId?: string) {
    const externalId = String(externalProductId || '').trim();
    if (!externalId) throw new NotFoundException('PRODUCT_NOT_FOUND');
    const product = await this.prisma.product.findFirst({
      where: { marketplace: 'MERCADOLIVRE', externalProductId: externalId },
    });
    if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');
    return this.setAffiliateUrl(product.id, affiliateUrl, userId);
  }

`;
  text = text.slice(0, index) + method + text.slice(index);
  fs.writeFileSync(file, text);
  console.log('Affiliate route repair applied');
} else {
  console.log('Affiliate route repair already applied');
}
