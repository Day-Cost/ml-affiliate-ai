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
        title: item.title || '',
        price: item.price ?? null,
        currency_id: item.currency_id || null,
        permalink: item.permalink || null,
        thumbnail: item.thumbnail || item.pictures?.[0]?.url || null,
        catalog_product_id: item.catalog_product_id || null,
        sold_quantity: item.sold_quantity ?? null,
        category_id: item.category_id || null,
        seller_id: item.seller?.id || item.seller_id || null,
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
      scope: 'offline_access read',
    });

    return `https://auth.mercadolivre.com.br/authorization?${p.toString()}`;
  }

  async exchangeCode(code: string, state: string) {
    const oauth = await this.prisma.oAuthState.findUnique({ where: { state } });
    if (!oauth || oauth.expiresAt < new Date()) {
      throw new UnauthorizedException('INVALID_OR_EXPIRED_OAUTH_STATE');
    }

    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.getOrThrow('ML_CLIENT_ID'),
      client_secret: this.config.getOrThrow('ML_CLIENT_SECRET'),
      code,
      redirect_uri: this.config.getOrThrow('ML_REDIRECT_URI'),
      code_verifier: oauth.codeVerifier,
    });

    const { data } = await axios.post(
      'https://api.mercadolibre.com/oauth/token',
      payload.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        httpsAgent: this.agent(),
        proxy: false,
      },
    );

    const me = await axios.get('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/json' },
      httpsAgent: this.agent(),
      proxy: false,
    });

    await this.prisma.marketplaceAccount.upsert({
      where: { userId_marketplace: { userId: oauth.userId, marketplace: 'MERCADOLIVRE' } },
      create: {
        userId: oauth.userId,
        marketplace: 'MERCADOLIVRE',
        externalUserId: BigInt(me.data.id),
        siteId: me.data.site_id || 'MLB',
        accessTokenEncrypted: this.crypto.encrypt(data.access_token),
        refreshTokenEncrypted: this.crypto.encrypt(data.refresh_token),
        tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
        status: 'CONNECTED',
        lastSyncAt: new Date(),
      },
      update: {
        externalUserId: BigInt(me.data.id),
        siteId: me.data.site_id || 'MLB',
        accessTokenEncrypted: this.crypto.encrypt(data.access_token),
        refreshTokenEncrypted: this.crypto.encrypt(data.refresh_token),
        tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
        status: 'CONNECTED',
        lastSyncAt: new Date(),
      },
    });

    await this.prisma.oAuthState.delete({ where: { state } });

    return {
      connected: true,
      mercadoLivreUserId: me.data.id,
      expiresIn: data.expires_in,
      scope: data.scope,
      canWrite: false,
      readOnly: true,
    };
  }

  private async access(userId: string) {
    const acc = await this.prisma.marketplaceAccount.findUnique({
      where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } },
    });
    if (!acc) throw new UnauthorizedException('MERCADO_LIVRE_NOT_CONNECTED');

    if (acc.tokenExpiresAt && acc.tokenExpiresAt.getTime() < Date.now() + 60000) {
      await this.refresh(userId);
    }

    const fresh = await this.prisma.marketplaceAccount.findUnique({ where: { id: acc.id } });
    return this.crypto.decrypt(fresh!.accessTokenEncrypted);
  }

  private async getWithToken(userId: string, url: string, params?: Record<string, any>) {
    let token = await this.access(userId);
    const agent = this.agent();

    try {
      return (
        await axios.get(url, {
          params,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'User-Agent': 'ML-Affiliate-AI/1.0',
          },
          timeout: 15000,
          httpsAgent: agent,
          proxy: false,
        })
      ).data;
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await this.refresh(userId);
        token = await this.access(userId);
        return (
          await axios.get(url, {
            params,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
              'User-Agent': 'ML-Affiliate-AI/1.0',
            },
            timeout: 15000,
            httpsAgent: agent,
            proxy: false,
          })
        ).data;
      }
      throw error;
    }
  }

  private async publicSearch(siteId: string, query: string) {
    return (
      await axios.get(`https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/search`, {
        params: { q: query.trim(), limit: 20 },
        headers: { Accept: 'application/json', 'User-Agent': 'ML-Affiliate-AI/1.0' },
        timeout: 15000,
        httpsAgent: this.agent(),
        proxy: false,
      })
    ).data;
  }

  private async authenticatedPublicSearch(siteId: string, query: string, userId: string) {
    const token = await this.access(userId);
    return (
      await axios.get(`https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/search`, {
        params: { q: query.trim(), limit: 20 },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': 'ML-Affiliate-AI/1.0',
        },
        timeout: 15000,
        httpsAgent: this.agent(),
        proxy: false,
      })
    ).data;
  }

  async diagnose(userId: string) {
    const token = await this.access(userId);
    const clientId = this.config.getOrThrow('ML_CLIENT_ID');
    const result: any = {
      ok: false,
      tokenValid: false,
      applicationValid: null,
      applicationCheckSucceeded: false,
      siteId: null,
      application: null,
      scope: null,
    };

    try {
      const me = (
        await axios.get('https://api.mercadolibre.com/users/me', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          timeout: 15000,
          httpsAgent: this.agent(),
          proxy: false,
        })
      ).data;
      result.tokenValid = true;
      result.siteId = me.site_id || null;
      result.userId = me.id;
      result.nickname = me.nickname;
    } catch (error: any) {
      result.tokenError = { status: error?.response?.status || null, body: error?.response?.data || null };
      return result;
    }

    try {
      const app = (
        await axios.get(`https://api.mercadolibre.com/applications/${encodeURIComponent(clientId)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          timeout: 15000,
          httpsAgent: this.agent(),
          proxy: false,
        })
      ).data;
      result.applicationCheckSucceeded = true;
      result.application = app;
      result.applicationValid = Boolean(app?.active);
      result.applicationSiteId = app?.site_id || null;
    } catch (error: any) {
      result.applicationError = { status: error?.response?.status || null, body: error?.response?.data || null };
    }

    const acc = await this.prisma.marketplaceAccount.findUnique({
      where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } },
    });
    result.scope = acc?.scope || null;
    result.hasMercadoPagoScope = String(acc?.scope || '')
      .split(/\s+/)
      .some((s: string) => s.startsWith('urn:mp:'));
    result.ok = result.tokenValid && result.hasMercadoPagoScope === false && result.applicationValid !== false;

    console.log(
      `[MercadoLivre] integration diagnosis ${JSON.stringify({
        ok: result.ok,
        tokenValid: result.tokenValid,
        applicationValid: result.applicationValid,
        applicationCheckSucceeded: result.applicationCheckSucceeded,
        siteId: result.siteId,
        applicationSiteId: result.applicationSiteId,
        hasMercadoPagoScope: result.hasMercadoPagoScope,
        applicationActive: result.application?.active ?? null,
        scope: result.scope,
      })}`,
    );

    return result;
  }

  async searchCatalog(userId: string, query: string) {
    const acc = await this.prisma.marketplaceAccount.findUnique({
      where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } },
    });
    if (!acc) throw new UnauthorizedException('MERCADO_LIVRE_NOT_CONNECTED');

    const siteId = acc.siteId || 'MLB';

    // Orus is read-only: when connected, prefer the authenticated Mercado Livre search.
    try {
      const search = await this.authenticatedPublicSearch(siteId, query, userId);
      console.log(
        `[MercadoLivre] authenticated item search ok query="${query}" results=${Array.isArray(search?.results) ? search.results.length : 0}`,
      );
      return this.normalizeSearch(search);
    } catch (authError: any) {
      const authStatus = authError?.response?.status;
      console.warn(
        `[MercadoLivre] authenticated item search failed query="${query}" status=${authStatus || 'none'} code=${authError?.code || 'none'} body=${JSON.stringify(authError?.response?.data || {})}`,
      );

      if (authStatus === 401) {
        throw new UnauthorizedException('MERCADO_LIVRE_TOKEN_INVALID_RECONNECT_REQUIRED');
      }

      // Public search remains a read-only fallback. It does not require write permissions.
      try {
        const search = await this.publicSearch(siteId, query);
        console.log(
          `[MercadoLivre] public item search ok after authenticated failure query="${query}" results=${Array.isArray(search?.results) ? search.results.length : 0}`,
        );
        return this.normalizeSearch(search);
      } catch (publicError: any) {
        const publicStatus = publicError?.response?.status;
        console.warn(
          `[MercadoLivre] public item search failed query="${query}" status=${publicStatus || 'none'} code=${publicError?.code || 'none'} body=${JSON.stringify(publicError?.response?.data || {})}`,
        );

        if (publicStatus === 403 || authStatus === 403) {
          let diagnosis: any = null;
          try {
            diagnosis = await this.diagnose(userId);
          } catch {}

          if (diagnosis?.hasMercadoPagoScope) {
            throw new UnauthorizedException('MERCADO_LIVRE_APP_MUST_BE_SEPARATED_FROM_MERCADO_PAGO');
          }
          if (diagnosis?.applicationValid === false && diagnosis?.applicationCheckSucceeded === true) {
            throw new UnauthorizedException('MERCADO_LIVRE_APPLICATION_INACTIVE_OR_INVALID');
          }
          throw new UnauthorizedException('MERCADO_LIVRE_SEARCH_FORBIDDEN_FROM_SERVER');
        }

        throw new UnauthorizedException(`MERCADO_LIVRE_SEARCH_FAILED_${publicStatus || authStatus || 'NETWORK'}`);
      }
    }
  }

  async getItem(userId: string, itemId: string) {
    return this.getWithToken(userId, `https://api.mercadolivre.com/items/${encodeURIComponent(itemId)}`);
  }

  async getCatalogProduct(userId: string, productId: string) {
    return this.getWithToken(userId, `https://api.mercadolivre.com/products/${encodeURIComponent(productId)}`);
  }

  async getCatalogProductItems(userId: string, productId: string) {
    return this.getWithToken(userId, `https://api.mercadolivre.com/products/${encodeURIComponent(productId)}/items`, {
      limit: 20,
    });
  }

  async account(userId: string) {
    const token = await this.access(userId);
    const { data } = await axios.get('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      httpsAgent: this.agent(),
      proxy: false,
    });
    await this.prisma.marketplaceAccount.updateMany({
      where: { userId, marketplace: 'MERCADOLIVRE' },
      data: { lastSyncAt: new Date(), status: 'CONNECTED', siteId: data.site_id || 'MLB' },
    });
    return {
      id: data.id,
      nickname: data.nickname,
      siteId: data.site_id,
      countryId: data.country_id,
      userType: data.user_type,
      permalink: data.permalink,
      tags: data.tags || [],
    };
  }

  async refresh(userId: string) {
    const acc = await this.prisma.marketplaceAccount.findUnique({
      where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } },
    });
    if (!acc) throw new UnauthorizedException('MERCADO_LIVRE_NOT_CONNECTED');

    const refreshToken = this.crypto.decrypt(acc.refreshTokenEncrypted);
    const payload = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.getOrThrow('ML_CLIENT_ID'),
      client_secret: this.config.getOrThrow('ML_CLIENT_SECRET'),
      refresh_token: refreshToken,
    });

    const { data } = await axios.post(
      'https://api.mercadolibre.com/oauth/token',
      payload.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        httpsAgent: this.agent(),
        proxy: false,
      },
    );

    await this.prisma.marketplaceAccount.update({
      where: { id: acc.id },
      data: {
        accessTokenEncrypted: this.crypto.encrypt(data.access_token),
        refreshTokenEncrypted: this.crypto.encrypt(data.refresh_token),
        tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
        status: 'CONNECTED',
        lastSyncAt: new Date(),
      },
    });

    return {
      refreshed: true,
      expiresIn: data.expires_in,
      scope: data.scope,
      canWrite: false,
      readOnly: true,
    };
  }

  async status(userId: string) {
    const acc = await this.prisma.marketplaceAccount.findUnique({
      where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } },
    });
    const scope = acc?.scope || '';
    return {
      configured: Boolean(this.config.get('ML_CLIENT_ID') && this.config.get('ML_CLIENT_SECRET')),
      connected: Boolean(acc),
      status: acc ? 'CONNECTED' : 'NOT_CONNECTED',
      expiresAt: acc?.tokenExpiresAt || null,
      lastSyncAt: acc?.lastSyncAt || null,
      scope,
      canRead: scope.split(' ').includes('read'),
      canWrite: false,
      readOnly: true,
      offlineAccess: scope.split(' ').includes('offline_access'),
      siteId: acc?.siteId || 'MLB',
    };
  }
}
