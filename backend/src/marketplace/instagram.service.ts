import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthService } from '../auth.service';

@Injectable()
export class InstagramService {
  private readonly scopes = 'instagram_business_basic,instagram_business_content_publish';

  constructor(private db: PrismaService, private cryptoService: CryptoService, private config: ConfigService, private auth: AuthService) {}

  private clientId() { return this.config.get<string>('INSTAGRAM_CLIENT_ID') || this.config.get<string>('META_CLIENT_ID') || ''; }
  private clientSecret() { return this.config.get<string>('INSTAGRAM_CLIENT_SECRET') || this.config.get<string>('META_CLIENT_SECRET') || ''; }
  private redirectUri() { return this.config.get<string>('INSTAGRAM_REDIRECT_URI') || `${this.config.get<string>('APP_URL')}/api/v1/marketplace/instagram/callback`; }
  isConfigured() { return !!this.clientId() && !!this.clientSecret(); }

  async connectUrl(userId: string) {
    if (!this.isConfigured()) throw new Error('INSTAGRAM_APP_NOT_CONFIGURED');
    const state = crypto.randomBytes(24).toString('hex');
    await this.db.oAuthState.create({ data: { state, codeVerifier: crypto.randomBytes(32).toString('base64url'), userId, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
    const url = new URL('https://www.instagram.com/oauth/authorize');
    url.searchParams.set('client_id', this.clientId());
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.scopes);
    url.searchParams.set('state', state);
    return { url: url.toString() };
  }

  async callback(code: string, state: string) {
    const oauth = await this.db.oAuthState.findUnique({ where: { state } });
    if (!oauth || oauth.expiresAt < new Date()) throw new UnauthorizedException('INVALID_OAUTH_STATE');
    await this.db.oAuthState.delete({ where: { id: oauth.id } });
    const body = new URLSearchParams({ client_id: this.clientId(), client_secret: this.clientSecret(), grant_type: 'authorization_code', redirect_uri: this.redirectUri(), code });
    const response = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) throw new Error(`INSTAGRAM_TOKEN_EXCHANGE_FAILED:${response.status}`);
    const token: any = await response.json();
    await this.db.channelConnection.upsert({
      where: { userId_channel: { userId: oauth.userId, channel: 'INSTAGRAM' } },
      create: { userId: oauth.userId, channel: 'INSTAGRAM', status: 'CONNECTED', externalUserId: String(token.user_id || ''), accessTokenEnc: this.cryptoService.encrypt(token.access_token), scopes: this.scopes },
      update: { status: 'CONNECTED', externalUserId: String(token.user_id || ''), accessTokenEnc: this.cryptoService.encrypt(token.access_token), scopes: this.scopes },
    });
    return { ok: true };
  }

  async status(userId: string) {
    const c = await this.db.channelConnection.findUnique({ where: { userId_channel: { userId, channel: 'INSTAGRAM' } } });
    return { configured: this.isConfigured(), connected: !!c && c.status === 'CONNECTED', status: c?.status || 'NOT_CONNECTED', scopes: c?.scopes || null, externalUserId: c?.externalUserId || null };
  }

  private async connection(userId: string) {
    const c = await this.db.channelConnection.findUnique({ where: { userId_channel: { userId, channel: 'INSTAGRAM' } } });
    if (!c?.accessTokenEnc) throw new UnauthorizedException('INSTAGRAM_NOT_CONNECTED');
    return c;
  }

  private async graph(userId: string, path: string, init: RequestInit = {}) {
    const c = await this.connection(userId);
    const token = this.cryptoService.decrypt(c.accessTokenEnc!);
    const url = new URL(`https://graph.instagram.com${path}`);
    url.searchParams.set('access_token', token);
    const response = await fetch(url, { ...init, headers: { ...(init.headers || {}), 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error(`INSTAGRAM_API_${response.status}:${await response.text()}`);
    return response.json();
  }

  async me(userId: string) { return this.graph(userId, '/me?fields=id,user_id,username,name,account_type'); }

  async createImagePost(userId: string, input: { imageUrl: string; caption?: string; shareToFeed?: boolean }) {
    const c = await this.connection(userId);
    const token = this.cryptoService.decrypt(c.accessTokenEnc!);
    const userIdValue = c.externalUserId;
    if (!userIdValue) throw new Error('INSTAGRAM_USER_ID_MISSING');
    const createUrl = new URL(`https://graph.instagram.com/${userIdValue}/media`);
    createUrl.searchParams.set('access_token', token);
    const params = { image_url: input.imageUrl, caption: input.caption || '' };
    const created = await fetch(createUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
    if (!created.ok) throw new Error(`INSTAGRAM_MEDIA_CREATE_${created.status}:${await created.text()}`);
    const container: any = await created.json();
    const publishUrl = new URL(`https://graph.instagram.com/${userIdValue}/media_publish`);
    publishUrl.searchParams.set('access_token', token);
    const published = await fetch(publishUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creation_id: container.id }) });
    if (!published.ok) throw new Error(`INSTAGRAM_MEDIA_PUBLISH_${published.status}:${await published.text()}`);
    return published.json();
  }

  async currentUser(req: any) {
    const h = req.headers.authorization || '';
    return this.auth.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
  }
}