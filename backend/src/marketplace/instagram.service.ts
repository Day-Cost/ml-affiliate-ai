import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthService } from '../auth.service';

@Injectable()
export class InstagramService {
  private readonly graphVersion: string;
  constructor(
    private db: PrismaService,
    private cryptoService: CryptoService,
    private config: ConfigService,
    private auth: AuthService,
  ) {
    this.graphVersion = this.config.get<string>('META_GRAPH_VERSION') || 'v27.0';
  }

  private appId() { return this.config.get<string>('META_APP_ID') || ''; }
  private appSecret() { return this.config.get<string>('META_APP_SECRET') || ''; }
  private configId() { return this.config.get<string>('INSTAGRAM_CONFIG_ID') || ''; }
  private redirectUri() {
    return this.config.get<string>('INSTAGRAM_REDIRECT_URI') ||
      `${this.config.get<string>('APP_URL')}/api/v1/marketplace/instagram/callback`;
  }
  private graphUrl(path: string) {
    return `https://graph.facebook.com/${this.graphVersion}/${path.replace(/^\//, '')}`;
  }
  isConfigured() { return !!this.appId() && !!this.appSecret() && !!this.configId() && !!this.redirectUri(); }

  async connectUrl(userId: string) {
    if (!this.isConfigured()) throw new Error('INSTAGRAM_UNIFIED_LOGIN_NOT_CONFIGURED');
    const state = crypto.randomBytes(24).toString('hex');
    await this.db.oAuthState.create({
      data: {
        state,
        codeVerifier: crypto.randomBytes(32).toString('base64url'),
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    const url = new URL(`https://www.facebook.com/${this.graphVersion}/dialog/oauth`);
    url.searchParams.set('client_id', this.appId());
    url.searchParams.set('config_id', this.configId());
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return { url: url.toString() };
  }

  private async graphRequest(path: string, accessToken: string) {
    const url = new URL(this.graphUrl(path));
    url.searchParams.set('access_token', accessToken);
    const response = await fetch(url);
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(`INSTAGRAM_GRAPH_API_ERROR:${payload?.error?.message || response.status}`);
    }
    return payload;
  }

  async callback(code: string, state: string) {
    if (!code || !state) throw new UnauthorizedException('INSTAGRAM_OAUTH_CODE_OR_STATE_MISSING');
    const oauth = await this.db.oAuthState.findUnique({ where: { state } });
    if (!oauth || oauth.expiresAt < new Date()) throw new UnauthorizedException('INVALID_OAUTH_STATE');
    await this.db.oAuthState.delete({ where: { id: oauth.id } });

    const tokenUrl = new URL(this.graphUrl('oauth/access_token'));
    tokenUrl.searchParams.set('client_id', this.appId());
    tokenUrl.searchParams.set('client_secret', this.appSecret());
    tokenUrl.searchParams.set('redirect_uri', this.redirectUri());
    tokenUrl.searchParams.set('code', code);
    const tokenResponse = await fetch(tokenUrl);
    const tokenPayload: any = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error(`INSTAGRAM_TOKEN_EXCHANGE_FAILED:${tokenPayload?.error?.message || tokenResponse.status}`);
    }

    const accessToken = tokenPayload.access_token as string;
    const expiresAt = tokenPayload.expires_in
      ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000)
      : null;

    const assigned = await this.graphRequest('me/assigned_instagram_accounts', accessToken);
    const account = Array.isArray(assigned?.data) ? assigned.data[0] : null;
    if (!account?.id) {
      throw new Error('INSTAGRAM_ASSET_NOT_FOUND: confira se a conta profissional foi incluída na configuração e atribuída ao usuário do sistema.');
    }

    const scopes = 'instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_messages';
    await this.db.channelConnection.upsert({
      where: { userId_channel: { userId: oauth.userId, channel: 'INSTAGRAM' } },
      create: {
        userId: oauth.userId, channel: 'INSTAGRAM', status: 'CONNECTED',
        externalUserId: String(account.id),
        accessTokenEnc: this.cryptoService.encrypt(accessToken),
        tokenExpiresAt: expiresAt, scopes,
      },
      update: {
        status: 'CONNECTED', externalUserId: String(account.id),
        accessTokenEnc: this.cryptoService.encrypt(accessToken),
        tokenExpiresAt: expiresAt, scopes,
      },
    });
    return { ok: true, instagramUsername: account.username || null, expiresAt };
  }

  async status(userId: string) {
    const c = await this.db.channelConnection.findUnique({
      where: { userId_channel: { userId, channel: 'INSTAGRAM' } },
    });
    return {
      configured: this.isConfigured(), connected: !!c && c.status === 'CONNECTED',
      status: c?.status || 'NOT_CONNECTED', scopes: c?.scopes || null,
      externalUserId: c?.externalUserId || null, tokenExpiresAt: c?.tokenExpiresAt || null,
    };
  }

  private async connection(userId: string) {
    const c = await this.db.channelConnection.findUnique({
      where: { userId_channel: { userId, channel: 'INSTAGRAM' } },
    });
    if (!c?.accessTokenEnc) throw new UnauthorizedException('INSTAGRAM_NOT_CONNECTED');
    return c;
  }

  private async graph(userId: string, path: string, init: RequestInit = {}) {
    const c = await this.connection(userId);
    const token = this.cryptoService.decrypt(c.accessTokenEnc!);
    const url = new URL(this.graphUrl(path));
    url.searchParams.set('access_token', token);
    const response = await fetch(url, {
      ...init, headers: { ...(init.headers || {}), 'Content-Type': 'application/json' },
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(`INSTAGRAM_API_${response.status}:${payload?.error?.message || JSON.stringify(payload)}`);
    }
    return payload;
  }

  async me(userId: string) {
    const c = await this.connection(userId);
    return this.graph(userId, `${c.externalUserId}?fields=id,username`);
  }

  async createImagePost(userId: string, input: { imageUrl: string; caption?: string; shareToFeed?: boolean }) {
    const c = await this.connection(userId);
    const accountId = c.externalUserId;
    if (!accountId) throw new Error('INSTAGRAM_USER_ID_MISSING');
    const container: any = await this.graph(userId, `${accountId}/media`, {
      method: 'POST', body: JSON.stringify({ image_url: input.imageUrl, caption: input.caption || '' }),
    });
    if (!container?.id) throw new Error('INSTAGRAM_MEDIA_CONTAINER_NOT_CREATED');
    return this.graph(userId, `${accountId}/media_publish`, {
      method: 'POST', body: JSON.stringify({ creation_id: container.id }),
    });
  }

  async currentUser(req: any) {
    const h = req.headers.authorization || '';
    return this.auth.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
  }
}
