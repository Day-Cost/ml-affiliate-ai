const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'product-hunter.service.ts');
let text = fs.readFileSync(file, 'utf8');

// A marketplace listing URL must come from Mercado Livre's /items/{item_id}
// response. Never construct a URL from an item ID or use a catalog PDP as an
// affiliate target.
const startMarker = '  private async resolveItemId(userId: string, itemId: string) {';
const endMarker = '\n  /**\n   * Converts a catalog PDP';
const start = text.indexOf(startMarker);
const end = text.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('PRODUCT_HUNTER_RESOLVE_ITEM_METHOD_NOT_FOUND');
const replacement = `  private async resolveItemId(userId: string, itemId: string) {
    const id = String(itemId || '').trim().toUpperCase();
    if (!/^MLB\\d{9,}$/.test(id)) {
      this.logger.debug(\`Skipping non-listing Mercado Livre ID \${id}\`);
      return null;
    }
    try {
      const detail = await this.mercadoLivre.getItem(userId, id);
      if (detail?.id && detail?.permalink && /^https?:\\/\\/(?:www\\.|produto\\.)?mercadolivre\\.com\\.br\\//i.test(String(detail.permalink))) {
        return detail;
      }
    } catch (error: any) {
      this.logger.debug(\`Authenticated item lookup failed for \${id}: \${error?.response?.status || error?.message || 'unknown'}\`);
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
const newScore = `      const latestScore = await this.prisma.productScore.findFirst({ where: { productId: product.id }, orderBy: { calculatedAt: 'desc' } });\n      const scoreData = { score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content };\n      if (latestScore) await this.prisma.productScore.update({ where: { id: latestScore.id }, data: scoreData });\n      else await this.prisma.productScore.create({ data: { productId: product.id, ...scoreData } });`;
if (text.includes(oldScore)) text = text.replace(oldScore, newScore);

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
      data = await this.mercadoLivre.searchCatalog(userId, query);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401 || error?.message === 'MERCADO_LIVRE_TOKEN_INVALID_RECONNECT_REQUIRED') {
        throw new UnauthorizedException('MERCADO_LIVRE_TOKEN_INVALID_RECONNECT_REQUIRED');
      }
      throw new UnauthorizedException(error?.message || \`MERCADO_LIVRE_SEARCH_FAILED_\${status || 'NETWORK'}\`);
    }

    const rawResults = Array.isArray(data?.results) ? data.results : [];
    const items = (await Promise.all(rawResults.map(async (raw: any) => {
      const detail: any = raw?.item || raw;
      const id = String(detail?.id || raw?.id || '').trim().toUpperCase();
      const productUrl = String(detail?.permalink || raw?.permalink || '').trim();
      if (!/^MLB\\d{9,}$/.test(id) || !/^https:\\/\\/(?:www\\.|produto\\.)?mercadolivre\\.com\\.br\\/.+$/i.test(productUrl)) return null;

      const price = Number(detail?.price ?? raw?.price ?? 0);
      const originalPrice = detail?.original_price != null ? Number(detail.original_price) : null;
      const discount = originalPrice && price > 0 ? Math.max(0, ((originalPrice - price) / originalPrice) * 100) : 0;
      const rating = detail?.reviews?.rating_average != null ? Number(detail.reviews.rating_average) : null;
      const reviewsCount = Number(detail?.reviews?.total || 0);
      const soldQuantityRaw = detail?.sold_quantity ?? raw?.sold_quantity ?? null;
      const soldQuantity = soldQuantityRaw == null ? null : Number(soldQuantityRaw);
      const demand = soldQuantity == null ? 35 : Math.min(100, soldQuantity > 0 ? 35 + Math.log10(soldQuantity + 1) * 20 : 25);
      const quality = rating == null ? 50 : Math.min(100, rating * 20);
      const pictureCount = Array.isArray(detail?.pictures) ? detail.pictures.length : 0;
      const content = Math.min(100, 55 + pictureCount * 5);
      const score = this.scoring.calculate({ demand, conversion: 50, commission: 50, discount: Math.min(100, discount), quality, competition: 50, trend: 50, content });
      const categoryId = detail?.category_id || raw?.category_id || null;
      const categoryName = detail?.domain_name || detail?.domain_id || null;
      const imageUrl = detail?.secure_thumbnail || detail?.thumbnail?.secure_url || detail?.thumbnail || raw?.thumbnail || detail?.pictures?.[0]?.secure_url || detail?.pictures?.[0]?.url || null;

      const product = await this.prisma.product.upsert({
        where: { marketplace_externalProductId: { marketplace: 'MERCADOLIVRE', externalProductId: id } },
        create: {
          id: \`ml-\${id}\`, marketplace: 'MERCADOLIVRE', externalProductId: id,
          title: String(detail?.title || raw?.title || ''), categoryId, categoryName, price, originalPrice,
          discountPercent: discount, currency: detail?.currency_id || raw?.currency_id || 'BRL', rating,
          reviewsCount, soldQuantity, sellerId: detail?.seller_id ? BigInt(detail.seller_id) : (raw?.seller_id ? BigInt(raw.seller_id) : null),
          sellerName: detail?.seller?.nickname || null, imageUrl, productUrl,
          availability: detail?.available_quantity != null ? String(detail.available_quantity) : null,
        },
        update: {
          title: String(detail?.title || raw?.title || ''), categoryId, categoryName, price, originalPrice,
          discountPercent: discount, currency: detail?.currency_id || raw?.currency_id || 'BRL', rating,
          reviewsCount, soldQuantity, sellerId: detail?.seller_id ? BigInt(detail.seller_id) : (raw?.seller_id ? BigInt(raw.seller_id) : null),
          sellerName: detail?.seller?.nickname || null, imageUrl, productUrl,
          availability: detail?.available_quantity != null ? String(detail.available_quantity) : null,
        },
      });

      const latestScore = await this.prisma.productScore.findFirst({ where: { productId: product.id }, orderBy: { calculatedAt: 'desc' } });
      const scoreData = { score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content };
      if (latestScore) await this.prisma.productScore.update({ where: { id: latestScore.id }, data: scoreData });
      else await this.prisma.productScore.create({ data: { productId: product.id, ...scoreData } });

      return {
        id, dbId: product.id, title: detail?.title || raw?.title, price, originalPrice,
        discountPercent: Number(discount.toFixed(2)), rating, reviewsCount, soldQuantity,
        thumbnail: imageUrl, permalink: productUrl, affiliateUrl: product.affiliateUrl, score,
        affiliateStatus: product.affiliateUrl ? 'ACTIVE' : 'PENDING',
        dataQuality: { demand: soldQuantity != null ? 'REAL' : 'LIMITED', conversion: 'NOT_AVAILABLE', commission: product.affiliateUrl ? 'LINK_READY' : 'LINK_REQUIRED', trend: 'NOT_AVAILABLE', competition: 'ESTIMATE' },
      };
    }))).filter(Boolean);

    this.logger.log(\`Product Hunter search query="\${query}" source=real-listings results=\${rawResults.length} realListings=\${items.length}\`);
    return { query, total: items.length, items };
  }
`;
text = text.slice(0, searchStart) + searchReplacement + text.slice(searchEnd);

// General listing search is currently returning server-side 403s. Keep the
// official catalog search as discovery, but only promote a catalog result when
// Mercado Livre gives us a real buy_box item and /items/{id} returns its real
// permalink. No synthetic URL and no catalog PDP URL is accepted.
const mlFile = path.join(__dirname, '..', 'src', 'marketplace', 'mercadolivre.service.ts');
let ml = fs.readFileSync(mlFile, 'utf8');
const mlSearchStartMarker = '  async searchCatalog(userId: string, query: string) {';
const mlSearchEndMarker = '\n  async getItem(userId: string, itemId: string) {';
const mlStart = ml.indexOf(mlSearchStartMarker);
const mlEnd = ml.indexOf(mlSearchEndMarker, mlStart);
if (mlStart < 0 || mlEnd < 0) throw new Error('MERCADO_LIVRE_SEARCH_METHOD_NOT_FOUND');
const mlSearchReplacement = `  private async catalogSearch(userId: string, siteId: string, query: string) {
    return this.getWithToken(userId, 'https://api.mercadolibre.com/products/search', {
      status: 'active', site_id: siteId, q: query.trim(), limit: 20,
    });
  }

  async searchCatalog(userId: string, query: string) {
    const acc = await this.prisma.marketplaceAccount.findUnique({ where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } } });
    if (!acc) throw new UnauthorizedException('MERCADO_LIVRE_NOT_CONNECTED');
    const siteId = acc.siteId || 'MLB';

    try {
      const search = await this.authenticatedPublicSearch(siteId, query, userId);
      const normalized = this.normalizeSearch(search);
      console.log(\`[MercadoLivre] listing search ok query="\${query}" results=\${normalized.results.length}\`);
      return normalized;
    } catch (authError: any) {
      const authStatus = authError?.response?.status;
      console.warn(\`[MercadoLivre] listing search unavailable query="\${query}" status=\${authStatus || 'none'}; using official catalog discovery\`);
      if (authStatus === 401) throw new UnauthorizedException('MERCADO_LIVRE_TOKEN_INVALID_RECONNECT_REQUIRED');

      const catalog = await this.catalogSearch(userId, siteId, query);
      const catalogResults = Array.isArray(catalog?.results) ? catalog.results : [];
      const realResults: any[] = [];

      for (const candidate of catalogResults.slice(0, 20)) {
        const catalogId = String(candidate?.id || candidate?.catalog_product_id || '').trim();
        if (!catalogId) continue;

        let catalogDetail: any = candidate;
        try {
          catalogDetail = await this.getCatalogProduct(userId, catalogId);
        } catch (error: any) {
          console.warn(\`[MercadoLivre] catalog detail unavailable id=\${catalogId} status=\${error?.response?.status || 'unknown'}\`);
          continue;
        }

        const itemId = String(catalogDetail?.buy_box_winner?.item_id || candidate?.buy_box_winner?.item_id || '').trim().toUpperCase();
        if (!/^MLB\\d{9,}$/.test(itemId)) continue;

        let item: any;
        try {
          item = await this.getItem(userId, itemId);
        } catch (error: any) {
          console.warn(\`[MercadoLivre] real listing detail unavailable id=\${itemId} status=\${error?.response?.status || 'unknown'}\`);
          continue;
        }

        const permalink = String(item?.permalink || '').trim();
        if (!item?.id || !/^https:\\/\\/(?:www\\.|produto\\.)?mercadolivre\\.com\\.br\\/.+$/i.test(permalink)) continue;

        realResults.push({
          id: String(item.id),
          title: item.title || catalogDetail?.name || candidate?.name || '',
          price: item.price ?? catalogDetail?.buy_box_winner?.price ?? null,
          currency_id: item.currency_id || catalogDetail?.buy_box_winner?.currency_id || 'BRL',
          permalink,
          thumbnail: item.secure_thumbnail || item.thumbnail || catalogDetail?.pictures?.[0]?.url || null,
          catalog_product_id: catalogId,
          sold_quantity: item.sold_quantity ?? catalogDetail?.buy_box_winner?.sold_quantity ?? null,
          category_id: item.category_id || catalogDetail?.buy_box_winner?.category_id || null,
          seller_id: item.seller_id || catalogDetail?.buy_box_winner?.seller_id || null,
          item,
        });
      }

      if (!realResults.length) {
        const persisted = await this.prisma.product.findMany({
          where: {
            marketplace: 'MERCADOLIVRE',
            productUrl: { not: null },
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { categoryId: { contains: query, mode: 'insensitive' } },
            ],
          },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        });
        for (const p of persisted) {
          const url = String(p.productUrl || '').trim();
          if (!/^https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/.+$/i.test(url)) continue;
          realResults.push({
            id: p.externalProductId,
            title: p.title,
            price: Number(p.price || 0),
            currency_id: p.currency || 'BRL',
            permalink: url,
            thumbnail: p.imageUrl,
            sold_quantity: p.soldQuantity,
            category_id: p.categoryId,
            seller_id: p.sellerId,
            affiliateUrl: p.affiliateUrl,
          });
        }
        console.log('[MercadoLivre] persisted real-listing fallback query="' + query + '" results=' + realResults.length);
      }

      console.log('[MercadoLivre] catalog discovery ok query="' + query + '" catalogResults=' + catalogResults.length + ' realListings=' + realResults.length);
      return { ...catalog, results: realResults };
    }
  }
`;
ml = ml.slice(0, mlStart) + mlSearchReplacement + ml.slice(mlEnd);
fs.writeFileSync(mlFile, ml);
fs.writeFileSync(file, text);
console.log('Product Hunter repair applied: only Mercado Livre-returned listing URLs are accepted');
