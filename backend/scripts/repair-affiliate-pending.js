const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'product-hunter.service.ts');
let text = fs.readFileSync(file, 'utf8');

const startMarker = '  async pendingAffiliateLinks() {';
const endMarker = '\n  async setAffiliateUrl(';
const start = text.indexOf(startMarker);
const end = text.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('AFFILIATE_PENDING_METHOD_MARKERS_NOT_FOUND');

const replacement = `  async pendingAffiliateLinks() {
    const candidates = await this.prisma.product.findMany({
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
        scores: {
          select: { score: true, calculatedAt: true },
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
      },
      take: 100,
    });

    // Do not expose synthetic URLs created by older repair versions. They will
    // be corrected when the product is searched again through the official API.
    const pending = candidates
      .filter(p => {
        const url = String(p.productUrl || '');
        return /^https:\\/\\/(?:www\\.)?mercadolivre\\.com\\.br\\/.+$/i.test(url)
          && !/^https:\\/\\/produto\\.mercadolivre\\.com\\.br\\/MLB\\d+$/i.test(url);
      })
      .map(p => ({
        id: p.id,
        externalProductId: p.externalProductId,
        title: p.title,
        price: Number(p.price || 0),
        discountPercent: Number(p.discountPercent || 0),
        soldQuantity: p.soldQuantity,
        imageUrl: p.imageUrl,
        productUrl: p.productUrl,
        categoryId: p.categoryId,
        categoryName: p.categoryName,
        updatedAt: p.updatedAt,
        score: p.scores[0]?.score ?? null,
        affiliateStatus: 'PENDING',
      }))
      .sort((a, b) => {
        const scoreA = Number(a.score ?? -1);
        const scoreB = Number(b.score ?? -1);
        if (scoreA !== scoreB) return scoreB - scoreA;
        const salesA = a.soldQuantity ?? -1;
        const salesB = b.soldQuantity ?? -1;
        if (salesA !== salesB) return salesB - salesA;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, 50);

    this.logger.log(`Affiliate pending check: ${pending.length} real listing products ready for manual affiliate link.`);
    return pending;
  }
`;

text = text.slice(0, start) + replacement + text.slice(end);

const initMarker = '  constructor(\n    private prisma: PrismaService,';
const initEndMarker = '\n  ) {}';
const initStart = text.indexOf(initMarker);
const initEnd = text.indexOf(initEndMarker, initStart);
if (initStart < 0 || initEnd < 0) throw new Error('PRODUCT_HUNTER_CONSTRUCTOR_NOT_FOUND');
const constructorEnd = initEnd + initEndMarker.length;
if (!text.includes('async onModuleInit()')) {
  const diagnostic = `\n\n  async onModuleInit() {\n    try {\n      const total = await this.prisma.product.count({ where: { marketplace: 'MERCADOLIVRE' } });\n      const pending = await this.prisma.product.count({ where: { marketplace: 'MERCADOLIVRE', affiliateUrl: null, productUrl: { not: null } } });\n      this.logger.log(\`Product Hunter startup diagnostic: mercadolivreProducts=\${total} pendingWithDirectUrl=\${pending}\`);\n    } catch (error: any) {\n      this.logger.warn(\`Product Hunter startup diagnostic failed: \${error?.message || 'unknown error'}\`);\n    }\n  }`;
  text = text.slice(0, constructorEnd) + diagnostic + text.slice(constructorEnd);
}

fs.writeFileSync(file, text);
console.log('Affiliate pending queue repair and startup diagnostic applied');
