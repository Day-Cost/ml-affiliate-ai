const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'product-hunter.service.ts');
let text = fs.readFileSync(file, 'utf8');

const startMarker = '  private async resolveItemId(userId: string, itemId: string) {';
const endMarker = '\n  /**\n   * Converts a catalog PDP';
const start = text.indexOf(startMarker);
const end = text.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('PRODUCT_HUNTER_RESOLVE_ITEM_METHOD_NOT_FOUND');

const replacement = `  private async resolveItemId(userId: string, itemId: string) {
    const id = String(itemId || '').trim();
    if (!id) return null;

    // Only real Mercado Livre marketplace publication IDs may reach /items/{id}.
    // Catalog/product IDs are rejected before any authenticated or public item call.
    if (!/^MLB\\d{9,}$/i.test(id)) {
      this.logger.debug(\`Skipping non-listing Mercado Livre ID \${id}\`);
      return null;
    }

    try {
      const detail = await this.mercadoLivre.getItem(userId, id);
      if (detail?.id && detail?.permalink) return detail;
    } catch (error: any) {
      this.logger.debug(\`Authenticated item lookup failed for \${id}: \${error?.response?.status || error?.message || 'unknown'}\`);
    }
    try {
      const detail = await this.publicItem(id);
      if (detail?.id && detail?.permalink) return detail;
    } catch (error: any) {
      this.logger.debug(\`Public item lookup failed for \${id}: \${error?.response?.status || error?.message || 'unknown'}\`);
    }
    return null;
  }
`;
text = text.slice(0, start) + replacement + text.slice(end);

text = text.replace(
  'where: { id: `ml-${id}` },',
  "where: { marketplace_externalProductId: { marketplace: 'MERCADOLIVRE', externalProductId: id } },"
);

const oldScore = `      await this.prisma.productScore.create({\n        data: { productId: product.id, score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content },\n      });`;
const newScore = `      const latestScore = await this.prisma.productScore.findFirst({\n        where: { productId: product.id },\n        orderBy: { calculatedAt: 'desc' },\n      });\n      const scoreData = { score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content };\n      if (latestScore) {\n        await this.prisma.productScore.update({ where: { id: latestScore.id }, data: scoreData });\n      } else {\n        await this.prisma.productScore.create({ data: { productId: product.id, ...scoreData } });\n      }`;
if (!text.includes(oldScore)) throw new Error('PRODUCT_HUNTER_SCORE_BLOCK_NOT_FOUND');
text = text.replace(oldScore, newScore);

// The backend must not resolve catalog PDPs into /items/{id} during ordinary search.
// Mercado Livre's site search already returns real marketplace publications with
// item IDs, permalinks, price and thumbnail. Use those listings directly. This
// removes the slow/fragile catalog-detail -> winner -> item chain and avoids
// treating catalog product IDs as marketplace listing IDs.
const searchStartMarker = '  async search(query: string, userId?: string) {';
const searchEndMarker = '\n  async searchForConnectedUser(query: string) {';
const searchStart = text.indexOf(searchStartMarker);
const searchEnd = text.indexOf(searchEndMarker, searchStart);
if (searchStart < 0 || searchEnd < 0) throw new Error('PRODUCT_HUNTER_SEARCH_METHOD_NOT_FOUND');

const searchReplacement = `  async search(query: string, userId?: string) {
    if (!query.trim()) return { query, total: 0, items: [] };
    if (!userId) throw new UnauthorizedException('MERCADO_LIVRE_USER_REQUIRED');

    let data: any;
    try {
      // This endpoint returns actual marketplace publications, not catalog PDPs.
      data = await axios.get('https://api.mercadolibre.com/sites/MLB/search', {
        params: { q: query.trim(), limit: 20 },
        headers: { Accept: 'application/json', 'User-Agent': 'ML-Affiliate-AI/1.0' },
        timeout: 10000,
        proxy: false,
      }).then((response) => response.data);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) throw new UnauthorizedException('MERCADO_LIVRE_TOKEN_INVALID_RECONNECT_REQUIRED');
      if (status === 403) throw new UnauthorizedException('MERCADO_LIVRE_SEARCH_FORBIDDEN_ACCESS');
      throw new UnauthorizedException(\`MERCADO_LIVRE_SEARCH_FAILED_\${status || 'NETWORK'}\`);
    }

    const results = Array.isArray(data?.results) ? data.results : [];
    const items = (await Promise.all(results.map(async (detail: any) => {
      const id = String(detail?.id || '').trim();
      const productUrl = String(detail?.permalink || '').trim();
      // A result is usable only when Mercado Livre itself supplied the real item
      // ID and its public listing URL. Never manufacture a URL from an ID.
      if (!/^MLB\\d{9,}$/i.test(id) || !/^https:\\/\\/www\\.mercadolivre\\.com\\.br\\/.+/.test(productUrl)) return null;

      const price = Number(detail?.price ?? 0);
      const originalPrice = detail?.original_price != null ? Number(detail.original_price) : null;
      const discount = originalPrice && price > 0 ? Math.max(0, ((originalPrice - price) / originalPrice) * 100) : 0;
      const rating = detail?.reviews?.rating_average != null ? Number(detail.reviews.rating_average) : null;
      const reviewsCount = Number(detail?.reviews?.total || 0);
      const soldQuantityRaw = detail?.sold_quantity ?? null;
      const soldQuantity = soldQuantityRaw == null ? null : Number(soldQuantityRaw);
      const demand = soldQuantity == null ? 35 : Math.min(100, soldQuantity > 0 ? 35 + Math.log10(soldQuantity + 1) * 20 : 25);
      const quality = rating == null ? 50 : Math.min(100, rating * 20);
      const content = Math.min(100, 55 + (Array.isArray(detail?.pictures) ? detail.pictures.length : 0) * 5);
      const score = this.scoring.calculate({ demand, conversion: 50, commission: 50, discount: Math.min(100, discount), quality, competition: 50, trend: 50, content });

      const categoryId = detail?.category_id || null;
      const categoryName = detail?.domain_id || null;
      const imageUrl = detail?.thumbnail || detail?.pictures?.[0]?.url || null;

      const product = await this.prisma.product.upsert({
        where: { marketplace_externalProductId: { marketplace: 'MERCADOLIVRE', externalProductId: id } },
        create: {
          id: \`ml-\${id}\`,
          marketplace: 'MERCADOLIVRE',
          externalProductId: id,
          title: String(detail?.title || ''),
          categoryId,
          categoryName,
          price,
          originalPrice,
          discountPercent: discount,
          currency: detail?.currency_id || 'BRL',
          rating,
          reviewsCount,
          soldQuantity,
          sellerId: detail?.seller?.id ? BigInt(detail.seller.id) : null,
          sellerName: detail?.seller?.nickname || null,
          imageUrl,
          productUrl,
          availability: detail?.available_quantity != null ? String(detail.available_quantity) : null,
        },
        update: {
          title: String(detail?.title || ''),
          categoryId,
          categoryName,
          price,
          originalPrice,
          discountPercent: discount,
          currency: detail?.currency_id || 'BRL',
          rating,
          reviewsCount,
          soldQuantity,
          sellerId: detail?.seller?.id ? BigInt(detail.seller.id) : null,
          sellerName: detail?.seller?.nickname || null,
          imageUrl,
          productUrl,
          availability: detail?.available_quantity != null ? String(detail.available_quantity) : null,
        },
      });

      const latestScore = await this.prisma.productScore.findFirst({
        where: { productId: product.id },
        orderBy: { calculatedAt: 'desc' },
      });
      const scoreData = { score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content };
      if (latestScore) {
        await this.prisma.productScore.update({ where: { id: latestScore.id }, data: scoreData });
      } else {
        await this.prisma.productScore.create({ data: { productId: product.id, ...scoreData } });
      }

      return {
        id,
        dbId: product.id,
        title: detail?.title,
        price,
        originalPrice,
        discountPercent: Number(discount.toFixed(2)),
        rating,
        reviewsCount,
        soldQuantity,
        thumbnail: imageUrl,
        permalink: productUrl,
        affiliateUrl: product.affiliateUrl,
        score,
        affiliateStatus: product.affiliateUrl ? 'ACTIVE' : 'PENDING',
        dataQuality: {
          demand: soldQuantity != null ? 'REAL' : 'LIMITED',
          conversion: 'NOT_AVAILABLE',
          commission: product.affiliateUrl ? 'LINK_READY' : 'LINK_REQUIRED',
          trend: 'NOT_AVAILABLE',
          competition: 'ESTIMATE',
        },
      };
    }))).filter(Boolean);

    this.logger.log(\`Product Hunter search query="\${query}" source=real-listings results=\${results.length} realListings=\${items.length}\`);
    return { query, total: items.length, items };
  }
`;
text = text.slice(0, searchStart) + searchReplacement + text.slice(searchEnd);

fs.writeFileSync(file, text);
console.log('Product Hunter repair applied');