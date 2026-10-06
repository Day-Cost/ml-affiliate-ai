import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';

@Injectable()
export class MercadoLivreService {
  constructor(private config: ConfigService, private prisma: PrismaService, private crypto: CryptoService) {}

  private agent() {
    return new https.Agent({ keepAlive: false, family: 4 });
  }

  private normalizeSearch(search: any) {
    return {
      ...search,
      results: (search?.results || []).map((item: any) => ({
        id: item.id,
        title: item.title || item.name || '',
        price: item.price ?? item.buy_box_winner?.price ?? null,
        currency_id: item.currency_id || item.buy_box_winner?.currency_id || null,
        permalink: item.permalink || null,
        thumbnail: item.thumbnail || item.pictures?.[0]?.url || null,
        catalog_product_id: item.catalog_product_id || null,
        sold_quantity: item.sold_quantity ?? null,
        category_id: item.category_id || item.buy_box_winner?.category_id || null,
        seller_id: item.seller?.id || item.seller_id || item.buy_box_winner?.seller_id || null,
        item,
      })),
    };
  }

  async getAuthorizationUrl(userId: string) {
    const state = randomBytes(24).toString('hex');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    await this.prisma.oAuthState.create({
      data: {
        state,
        codeVerifier: verifier,
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const p = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.getOrThrow('ML_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow('ML_REDIRECT_URI'),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: 'offline_access read write',
    });

    return `https://auth.mercadolivre.com.br/authorization?${p.toString()}`;
  }

  async exchangeCode(code: string, state: string) {
    const oauth = await this.prisma.oAuthState.findUnique({ where: { state } });
    if (!oauth || oauth.expiresAt < new Date()) throw new UnauthorizedException('INVALID_OR_EXPIRED_OAUTH_STATE');

    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.getOrThrow('ML_CLIENT_ID'),
      client_secret: this.config.getOrThrow('ML_CLIENT_SECRET'),
      code,
      redirect_uri: this.config.getOrThrow('ML_REDIRECT_URI'),
      code_verifier: oauth.codeVerifier,
    });

    const { data } = await axios.post('https://api.mercadolibre.com/oauth/token', payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      httpsAgent: this.agent(), proxy: false,
    });

    const me = await axios.get('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/json' },
      httpsAgent: this.agent(), proxy: false,
    });

    await this.prisma.marketplaceAccount.upsert({
      where: { userId_marketplace: { userId: oauth.userId, marketplace: 'MERCADOLIVRE' } },
      create: {
        userId: oauth.userId, marketplace: 'MERCADOLIVRE', externalUserId: BigInt(me.data.id),
        siteId: me.data.site_id || 'MLB', accessTokenEncrypted: this.crypto.encrypt(data.access_token),
        refreshTokenEncrypted: this.crypto.encrypt(data.refresh_token), tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope, status: 'CONNECTED', lastSyncAt: new Date(),
      },
      update: {
        externalUserId: BigInt(me.data.id), siteId: me.data.site_id || 'MLB',
        accessTokenEncrypted: this.crypto.encrypt(data.access_token), refreshTokenEncrypted: this.crypto.encrypt(data.refresh_token),
        tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000), scope: data.scope,
        status: 'CONNECTED', lastSyncAt: new Date(),
      },
    });
    await this.prisma.oAuthState.delete({ where: { state } });

    return { connected: true, mercadoLivreUserId: me.data.id, expiresIn: data.expires_in, scope: data.scope, canWrite: String(data.scope || '').split(/\s+/).includes('write'), readOnly: !String(data.scope || '').split(/\s+/).includes('write') };
  }

  private async access(userId: string) {
    const acc = await this.prisma.marketplaceAccount.findUnique({ where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } } });
    if (!acc) throw new UnauthorizedException('MERCADO_LIVRE_NOT_CONNECTED');
    if (acc.tokenExpiresAt && acc.tokenExpiresAt.getTime() < Date.now() + 60000) await this.refresh(userId);
    const fresh = await this.prisma.marketplaceAccount.findUnique({ where: { id: acc.id } });
    return this.crypto.decrypt(fresh!.accessTokenEncrypted);
  }

  private async getWithToken(userId: string, url: string, params?: Record<string, any>) {
    let token = await this.access(userId);
    const agent = this.agent();
    try {
      return (await axios.get(url, { params, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'ML-Affiliate-AI/1.0' }, timeout: 15000, httpsAgent: agent, proxy: false })).data;
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await this.refresh(userId);
        token = await this.access(userId);
        return (await axios.get(url, { params, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'ML-Affiliate-AI/1.0' }, timeout: 15000, httpsAgent: agent, proxy: false })).data;
      }
      throw error;
    }
  }

  /**
   * Search the live Mercado Livre marketplace listings using the connected
   * user's OAuth token. This is the ONLY discovery source Product Hunter uses.
   * Catalog/PDP/User Product records are deliberately excluded from discovery
   * so they can never be mistaken for a purchasable listing.
   */
  private async authenticatedListingSearch(siteId: string, query: string, userId: string, offset = 0, limit = 20) {
    return this.getWithToken(userId, `https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/search`, {
      q: query.trim(),
      offset,
      limit: Math.min(100, Math.max(1, limit)),
    });
  }

  private logApiError(context: string, error: any) {
    const status = error?.response?.status || 'none';
    const body = error?.response?.data;
    const code = body?.code || body?.error || body?.cause?.[0]?.code || null;
    const blockedBy = body?.blocked_by || null;
    const message = body?.message || error?.message || 'unknown';
    console.warn(`[MercadoLivre] ${context} status=${status} code=${code || 'none'} blocked_by=${blockedBy || 'none'} message="${String(message).slice(0, 240)}"`);
    return { status, code, blockedBy, message };
  }

  async searchCatalog(userId: string, query: string, offset = 0, limit = 20) {
    const acc = await this.prisma.marketplaceAccount.findUnique({
      where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } },
    });
    if (!acc) throw new UnauthorizedException('MERCADO_LIVRE_NOT_CONNECTED');
    if (!query.trim()) return { query, results: [], paging: { total: 0, offset, limit } };

    const siteId = acc.siteId || 'MLB';
    try {
      // Mercado Livre documents /sites/{site}/search as the source of active
      // marketplace listings. The OAuth token MUST be sent in Authorization.
      // We intentionally do not fall back to /products/search, PDPs, or
      // USER_PRODUCT records because those are not marketplace listings.
      const raw = await this.authenticatedListingSearch(siteId, query, userId, offset, limit);
      const normalized = this.normalizeSearch(raw);
      const realListings = (normalized.results || []).filter((item: any) => {
        const id = String(item?.id || '').trim().toUpperCase();
        const listing = item?.item || item;
        if (!/^MLB\\d+$/.test(id)) return false;
        if (String(listing?.user_product_id || '').toUpperCase().startsWith('MLBU')) return false;
        if (String(listing?.status || '').toLowerCase() && String(listing.status).toLowerCase() !== 'active') return false;
        const permalink = String(listing?.permalink || '').trim();
        try {
          const url = new URL(permalink);
          if (!/(^|\\.)mercadolivre\\.com\\.br$/.test(url.hostname.toLowerCase())) return false;
          if (/\\/p\\/|\\/up\\//i.test(url.pathname)) return false;
        } catch { return false; }
        if (listing?.available_quantity != null && Number(listing.available_quantity) <= 0) return false;
        return true;
      });

      const result = {
        ...normalized,
        results: realListings,
      };
      console.log(`[MercadoLivre] authenticated live-listing search query="${query}" sourceResults=${normalized.results.length} realListings=${realListings.length} offset=${offset} limit=${limit} total=${Number(raw?.paging?.total || 0)}`);
      return result;
    } catch (error: any) {
      const detail = this.logApiError(`authenticated live-listing search failed query="${query}"`, error);
      if (detail.status === 401) throw new UnauthorizedException('MERCADO_LIVRE_TOKEN_INVALID_RECONNECT_REQUIRED');
      if (detail.status === 403) throw new UnauthorizedException('MERCADO_LIVRE_LISTING_SEARCH_FORBIDDEN_POLICY');
      throw new UnauthorizedException(`MERCADO_LIVRE_LISTING_SEARCH_FAILED_${detail.status || 'NETWORK'}`);
    }
  }
  async getItem(userId: string, itemId: string) {
    const id = String(itemId || '').trim().toUpperCase();
    if (!/^MLB\d+$/.test(id)) throw new UnauthorizedException('MERCADO_LIVRE_INVALID_ITEM_ID');
    return this.getWithToken(userId, `https://api.mercadolibre.com/items/${encodeURIComponent(id)}`);
  }
  async getCatalogProduct(userId: string, productId: string) { return this.getWithToken(userId, `https://api.mercadolibre.com/products/${encodeURIComponent(productId)}`); }
  async getCatalogProductItems(userId: string, productId: string) { return this.getWithToken(userId, `https://api.mercadolibre.com/products/${encodeURIComponent(productId)}/items`, { limit: 20 }); }

  async diagnose(userId: string) {
    const token = await this.access(userId);
    const clientId = this.config.getOrThrow('ML_CLIENT_ID');
    const result: any = { ok: false, tokenValid: false, applicationValid: null, applicationCheckSucceeded: false, siteId: null, application: null, scope: null };
    try {
      const me = (await axios.get('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, timeout: 15000, httpsAgent: this.agent(), proxy: false })).data;
      result.tokenValid = true; result.siteId = me.site_id || null; result.userId = me.id; result.nickname = me.nickname;
    } catch (error: any) { result.tokenError = { status: error?.response?.status || null, body: error?.response?.data || null }; return result; }
    try {
      const app = (await axios.get(`https://api.mercadolibre.com/applications/${encodeURIComponent(clientId)}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, timeout: 15000, httpsAgent: this.agent(), proxy: false })).data;
      result.applicationCheckSucceeded = true; result.application = app; result.applicationValid = Boolean(app?.active); result.applicationSiteId = app?.site_id || null;
    } catch (error: any) { result.applicationError = { status: error?.response?.status || null, body: error?.response?.data || null }; }
    const acc = await this.prisma.marketplaceAccount.findUnique({ where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } } });
    result.scope = acc?.scope || null;
    result.hasMercadoPagoScope = String(acc?.scope || '').split(/\s+/).some((s: string) => s.startsWith('urn:mp:'));
    result.ok = result.tokenValid && result.hasMercadoPagoScope === false && result.applicationValid !== false;
    console.log(`[MercadoLivre] integration diagnosis ${JSON.stringify({ ok: result.ok, tokenValid: result.tokenValid, applicationValid: result.applicationValid, applicationCheckSucceeded: result.applicationCheckSucceeded, siteId: result.siteId, applicationSiteId: result.applicationSiteId, hasMercadoPagoScope: result.hasMercadoPagoScope, applicationActive: result.application?.active ?? null, scope: result.scope })}`);
    return result;
  }

  async account(userId: string) {
    const token = await this.access(userId);
    const { data } = await axios.get('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, httpsAgent: this.agent(), proxy: false });
    await this.prisma.marketplaceAccount.updateMany({ where: { userId, marketplace: 'MERCADOLIVRE' }, data: { lastSyncAt: new Date(), status: 'CONNECTED', siteId: data.site_id || 'MLB' } });
    const acc = await this.prisma.marketplaceAccount.findUnique({ where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } } });
    const scopes = String(acc?.scope || '').split(/\s+/).filter(Boolean);
    return { id: data.id, nickname: data.nickname, siteId: data.site_id, countryId: data.country_id, userType: data.user_type, permalink: data.permalink, tags: data.tags || [], scope: acc?.scope || null, canWrite: scopes.includes('write'), readOnly: !scopes.includes('write') };
  }
  async refresh(userId: string) {
    const acc = await this.prisma.marketplaceAccount.findUnique({ where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } } });
    if (!acc) throw new UnauthorizedException('MERCADO_LIVRE_NOT_CONNECTED');
    const refreshToken = this.crypto.decrypt(acc.refreshTokenEncrypted);
    const payload = new URLSearchParams({ grant_type: 'refresh_token', client_id: this.config.getOrThrow('ML_CLIENT_ID'), client_secret: this.config.getOrThrow('ML_CLIENT_SECRET'), refresh_token: refreshToken });
    const { data } = await axios.post('https://api.mercadolibre.com/oauth/token', payload.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, httpsAgent: this.agent(), proxy: false });
    await this.prisma.marketplaceAccount.update({ where: { id: acc.id }, data: { accessTokenEncrypted: this.crypto.encrypt(data.access_token), refreshTokenEncrypted: this.crypto.encrypt(data.refresh_token), tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000), scope: data.scope, status: 'CONNECTED', lastSyncAt: new Date() } });
    return { refreshed: true, expiresIn: data.expires_in, scope: data.scope };
  }
}
