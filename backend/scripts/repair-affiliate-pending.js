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
    // The pending queue must contain only real Mercado Livre publications that
    // already have a direct marketplace URL. Old/stale catalog records without
    // a listing URL must never make the UI show an empty or unusable queue.
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

    const pending = candidates
      .filter(p => /^https:\\/\\/(?:www\\.)?mercadolivre\\.com\\.br\\/.+|^https:\\/\\/produto\\.mercadolivre\\.com\\.br\\/.+$/i.test(String(p.productUrl || '')))
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

    this.logger.log(\`Affiliate pending check: \${pending.length} real listing products ready for manual affiliate link.\`);
    return pending;
  }
`;

text = text.slice(0, start) + replacement + text.slice(end);
fs.writeFileSync(file, text);
console.log('Affiliate pending queue repair applied');
