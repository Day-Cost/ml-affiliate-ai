import { Injectable, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { MercadoLivreService } from '../marketplace/mercadolivre.service';

@Injectable()
export class ProductHunterService {
  private readonly logger = new Logger(ProductHunterService.name);

  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
    private mercadoLivre: MercadoLivreService,
  ) {}

  async isReadyForAutomation() {
    const acc = await this.prisma.marketplaceAccount.findFirst({
      where: { marketplace: 'MERCADOLIVRE', status: 'CONNECTED' },
      orderBy: { updatedAt: 'desc' },
    });
    if (!acc) return { ready: false, reason: 'MERCADO_LIVRE_NOT_CONNECTED' };
    const scope = String(acc.scope || '').split(/\s+/).filter(Boolean);
    if (!scope.includes('read')) return { ready: false, reason: 'MERCADO_LIVRE_READ_SCOPE_REQUIRED' };
    return { ready: true, userId: acc.userId };
  }

  private async publicItem(itemId: string) {
    return (await axios.get(`https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'ML-Affiliate-AI/1.0' },
      timeout: 15000,
      proxy: false,
    })).data;
  }

  private async resolveItemId(userId: string, itemId: string) {
    const id = String(itemId || '').trim();
    if (!id) return null;
    try {
      const detail = await this.mercadoLivre.getItem(userId, id);
      if (detail?.id && detail?.permalink) return detail;
    } catch (error: any) {
      this.logger.debug(`Authenticated item lookup failed for ${id}: ${error?.response?.status || error?.message || 'unknown'}`);
    }
    try {
      const detail = await this.publicItem(id);
      if (detail?.id && detail?.permalink) return detail;
    } catch (error: any) {
      this.logger.debug(`Public item lookup failed for ${id}: ${error?.response?.status || error?.message || 'unknown'}`);
    }
    return null;
  }

  /**
   * Converts a catalog PDP into a real marketplace listing.
   * We never use the /products/{id} PDP permalink as the affiliate target.
   * The target must be an /items/{item_id} permalink returned by Mercado Livre.
   */
  private async resolveRealItem(userId: string, candidate: any) {
    const directWinner = candidate?.buy_box_winner || candidate?.item?.buy_box_winner;
    const directWinnerId = String(directWinner?.item_id || directWinner?.id || '').trim();
    if (directWinnerId) {
      const detail = await this.resolveItemId(userId, directWinnerId);
      if (detail) return { itemId: String(detail.id), detail, catalog: null };
    }

    const catalogId = String(
      candidate?.catalog_product_id || candidate?.item?.catalog_product_id || candidate?.id || ''
    ).trim();
    if (!catalogId) return { itemId: null, detail: null, catalog: null };

    try {
      const catalog = await this.mercadoLivre.getCatalogProduct(userId, catalogId);
      const winnerId = String(catalog?.buy_box_winner?.item_id || catalog?.buy_box_winner?.id || '').trim();

      if (winnerId) {
        const detail = await this.resolveItemId(userId, winnerId);
        if (detail) return { itemId: String(detail.id), detail, catalog };
      }

      // A catalog PDP can legitimately have buy_box_winner=null. In that case
      // the official API exposes the competing marketplace publications through
      // /products/{product_id}/items. Use the first active real listing that has
      // a real item permalink instead of discarding the catalog product.
      const listingData = await this.mercadoLivre.getCatalogProductItems(userId, catalogId);
      const listingIds = (listingData?.results || [])
        .map((x: any) => String(x?.item_id || x?.id || '').trim())
        .filter(Boolean);

      for (const listingId of listingIds.slice(0, 10)) {
        const detail = await this.resolveItemId(userId, listingId);
        if (detail) {
          this.logger.log(`Resolved catalog ${catalogId} to real item ${detail.id} through PDP items`);
          return { itemId: String(detail.id), detail, catalog };
        }
      }

      this.logger.warn(`Catalog ${catalogId} has no resolvable real item (winner/items)`);
      return { itemId: null, detail: null, catalog };
    } catch (error: any) {
      this.logger.warn(`Could not resolve catalog product ${catalogId}: ${error?.response?.status || error?.message || 'unknown error'}`);
      return { itemId: null, detail: null, catalog: null };
    }
  }

  async search(query: string, userId?: string) {
    if (!query.trim()) return { query, total: 0, items: [] };
    if (!userId) throw new UnauthorizedException('MERCADO_LIVRE_USER_REQUIRED');

    let data: any;
    try {
      data = await this.mercadoLivre.searchCatalog(userId, query);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) throw new UnauthorizedException('MERCADO_LIVRE_TOKEN_INVALID_RECONNECT_REQUIRED');
      if (status === 403) throw new UnauthorizedException('MERCADO_LIVRE_FORBIDDEN_SEARCH_ACCESS');
      if (error?.message?.startsWith('MERCADO_LIVRE_SEARCH_FORBIDDEN_')) throw new UnauthorizedException(error.message);
      throw new UnauthorizedException(`MERCADO_LIVRE_SEARCH_FAILED_${status || 'NETWORK'}`);
    }

    const items = (await Promise.all((data.results || []).map(async (p: any) => {
      const resolved = await this.resolveRealItem(userId, p);
      if (!resolved.detail) return null;

      const detail: any = resolved.detail;
      let catalog: any = resolved.catalog || {};
      const catalogProductId = detail.catalog_product_id || p.catalog_product_id || p.id;
      if (catalogProductId && !catalog.id) {
        try { catalog = await this.mercadoLivre.getCatalogProduct(userId, catalogProductId); } catch {}
      }

      const price = Number(detail.price ?? p.price ?? 0);
      const originalPrice = detail.original_price != null ? Number(detail.original_price) : null;
      const discount = originalPrice && price > 0 ? Math.max(0, ((originalPrice - price) / originalPrice) * 100) : 0;
      const rating = detail.reviews?.rating_average != null ? Number(detail.reviews.rating_average) : null;
      const reviewsCount = Number(detail.reviews?.total || 0);
      const soldQuantityRaw = detail.sold_quantity ?? p.sold_quantity ?? null;
      const soldQuantity = soldQuantityRaw == null ? null : Number(soldQuantityRaw);
      const demand = soldQuantity == null ? 35 : Math.min(100, soldQuantity > 0 ? 35 + Math.log10(soldQuantity + 1) * 20 : 25);
      const quality = rating == null ? 50 : Math.min(100, rating * 20);
      const pictures = catalog.pictures || [];
      const content = Math.min(100, 55 + Math.max(pictures.length, Array.isArray(detail.pictures) ? detail.pictures.length : 0) * 5);
      const score = this.scoring.calculate({ demand, conversion: 50, commission: 50, discount: Math.min(100, discount), quality, competition: 50, trend: 50, content });

      const id = String(detail.id || '');
      const productUrl = String(detail.permalink || '').trim();
      if (!id || !productUrl || !productUrl.startsWith('https://')) return null;

      const categoryId = detail.category_id || catalog.category_id || p.category_id || null;
      const categoryName = detail.domain_name || catalog.domain_name || null;
      const imageUrl = detail.thumbnail?.secure_url || detail.thumbnail || detail.pictures?.[0]?.url || p.thumbnail || catalog.pictures?.[0]?.url || null;

      const product = await this.prisma.product.upsert({
        where: { id: `ml-${id}` },
        create: {
          id: `ml-${id}`,
          marketplace: 'MERCADOLIVRE',
          externalProductId: id,
          title: String(detail.title || p.title || catalog.name || ''),
          categoryId,
          categoryName,
          price,
          originalPrice,
          discountPercent: discount,
          currency: detail.currency_id || p.currency_id || 'BRL',
          rating,
          reviewsCount,
          soldQuantity,
          sellerId: detail.seller_id ? BigInt(detail.seller_id) : (p.seller_id ? BigInt(p.seller_id) : null),
          sellerName: detail.seller?.nickname || null,
          imageUrl,
          productUrl,
          availability: detail.available_quantity != null ? String(detail.available_quantity) : null,
        },
        update: {
          title: String(detail.title || p.title || catalog.name || ''),
          categoryId,
          categoryName,
          price,
          originalPrice,
          discountPercent: discount,
          currency: detail.currency_id || p.currency_id || 'BRL',
          rating,
          reviewsCount,
          soldQuantity,
          sellerId: detail.seller_id ? BigInt(detail.seller_id) : (p.seller_id ? BigInt(p.seller_id) : null),
          sellerName: detail.seller?.nickname || null,
          imageUrl,
          productUrl,
          availability: detail.available_quantity != null ? String(detail.available_quantity) : null,
        },
      });

      await this.prisma.productScore.create({
        data: { productId: product.id, score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content },
      });

      return {
        id,
        dbId: product.id,
        title: detail.title || p.title || catalog.name,
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

    this.logger.log(`Product Hunter search query="${query}" catalogResults=${data.results?.length || 0} realListings=${items.length}`);
    return { query, total: items.length, items };
  }

  async searchForConnectedUser(query: string) {
    const ready = await this.isReadyForAutomation();
    if (!ready.ready) throw new Error(ready.reason);
    return this.search(query, ready.userId);
  }

  async top() {
    const products = await this.prisma.product.findMany({
      select: { id: true, title: true, price: true, originalPrice: true, discountPercent: true, soldQuantity: true, imageUrl: true, productUrl: true, affiliateUrl: true, updatedAt: true, scores: { select: { score: true, calculatedAt: true }, orderBy: { calculatedAt: 'desc' }, take: 1 } },
      orderBy: [{ soldQuantity: 'desc' }, { updatedAt: 'desc' }],
      take: 50,
    });
    return products.map(p => ({ id: p.id, title: p.title, price: Number(p.price || 0), originalPrice: p.originalPrice == null ? null : Number(p.originalPrice), discountPercent: Number(p.discountPercent || 0), soldQuantity: p.soldQuantity, imageUrl: p.imageUrl, productUrl: p.productUrl, affiliateUrl: p.affiliateUrl, affiliateStatus: p.affiliateUrl ? 'ACTIVE' : 'PENDING', updatedAt: p.updatedAt, latestScore: p.scores[0]?.score ?? null })).sort((a, b) => { const salesA = a.soldQuantity ?? -1; const salesB = b.soldQuantity ?? -1; if (salesA !== salesB) return salesB - salesA; return Number(b.latestScore || 0) - Number(a.latestScore || 0); });
  }

  async pendingAffiliateLinks() {
    const candidates = await this.prisma.product.findMany({
      where: { marketplace: 'MERCADOLIVRE', affiliateUrl: null },
      select: { id: true, externalProductId: true, title: true, price: true, discountPercent: true, soldQuantity: true, imageUrl: true, productUrl: true, categoryId: true, categoryName: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });

    const missingUrl = candidates.filter(p => !p.productUrl);
    if (missingUrl.length) {
      const acc = await this.prisma.marketplaceAccount.findFirst({ where: { marketplace: 'MERCADOLIVRE', status: 'CONNECTED' }, orderBy: { updatedAt: 'desc' } });
      if (acc) {
        for (const product of missingUrl) {
          try {
            const direct = await this.resolveItemId(acc.userId, product.externalProductId);
            const resolved = direct ? { detail: direct } : await this.resolveRealItem(acc.userId, { id: product.externalProductId });
            const detail: any = resolved.detail;
            const permalink = detail?.permalink || null;
            if (permalink && detail?.id) {
              await this.prisma.product.update({ where: { id: product.id }, data: { productUrl: permalink, externalProductId: String(detail.id) } });
              product.productUrl = permalink;
            }
          } catch (error: any) {
            this.logger.warn(`Could not repair product URL ${product.externalProductId}: ${error?.message || 'unknown error'}`);
          }
        }
      }
    }

    const pending = candidates.filter(p => !!p.productUrl);
    this.logger.log(`Affiliate pending check: ${pending.length} products ready, ${candidates.length - pending.length} still without direct product URL.`);
    return pending;
  }

  async setAffiliateUrl(productId: string, affiliateUrl: string, userId?: string) {
    const url = String(affiliateUrl || '').trim();
    if (!/^https:\/\/meli\.la\/[A-Za-z0-9]+$/i.test(url)) throw new Error('AFFILIATE_URL_MUST_BE_OFFICIAL_MELI_SHORT_LINK');
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('PRODUCT_NOT_FOUND');
    const updated = await this.prisma.product.update({ where: { id: productId }, data: { affiliateUrl: url } });
    if (userId) await this.createMarketingQueue(userId, updated);
    return { ...updated, affiliateStatus: 'ACTIVE', marketing: 'QUEUED', storefront: 'ACTIVE' };
  }

  private async createMarketingQueue(userId: string, product: any) {
    const channels = [
      { channel: 'WEB', type: 'POST', publishMode: 'AUTO' },
      { channel: 'TIKTOK', type: 'VIDEO_SCRIPT', publishMode: 'MANUAL' },
      { channel: 'INSTAGRAM', type: 'POST', publishMode: 'MANUAL' },
      { channel: 'PINTEREST', type: 'POST', publishMode: 'MANUAL' },
    ];
    for (const item of channels) {
      const exists = await this.prisma.marketingContent.findFirst({ where: { userId, productId: product.id, channel: item.channel, status: { in: ['DRAFT', 'APPROVED', 'PUBLISHED'] } } });
      if (exists) continue;
      const title = product.title;
      const caption = `Confira ${title}. ${product.discountPercent ? `Desconto de ${Number(product.discountPercent).toFixed(0)}%. ` : ''}Acesse pelo link oficial de afiliado: ${product.affiliateUrl}`;
      const script = `Gancho: ${title}.\nMostre os principais benefícios reais do produto.\nOferta: apresente preço e desconto somente quando confirmados.\nCTA: acesse pelo link oficial de afiliado.`;
      await this.prisma.marketingContent.create({ data: { userId, productId: product.id, channel: item.channel, contentType: item.type, title, caption, script: item.channel === 'TIKTOK' ? script : null, affiliateUrl: product.affiliateUrl, aiGenerated: false, status: 'DRAFT', publishMode: item.publishMode } });
    }
  }
}
