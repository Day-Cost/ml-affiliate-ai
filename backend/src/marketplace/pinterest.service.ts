import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthService } from '../auth.service';

@Injectable()
export class PinterestService {
  private readonly scopes = 'boards:read boards:write pins:read pins:write';

  constructor(
    private db: PrismaService,
    private cryptoService: CryptoService,
    private config: ConfigService,
    private auth: AuthService,
  ) {}

  private redirectUri() {
    return this.config.get<string>('PINTEREST_REDIRECT_URI') || `${this.config.get<string>('APP_URL')}/api/v1/marketplace/pinterest/callback`;
  }

  private clientId() {
    return this.config.get<string>('PINTEREST_APP_ID') || '';
  }

  private clientSecret() {
    return this.config.get<string>('PINTEREST_CLIENT_SECRET') || '';
  }

  async connectUrl(userId: string) {
    if (!this.clientId() || !this.clientSecret()) throw new Error('PINTEREST_APP_NOT_CONFIGURED');
    const state = crypto.randomBytes(24).toString('hex');
    const verifier = crypto.randomBytes(32).toString('base64url');
    await this.db.oAuthState.create({ data: { state, codeVerifier: verifier, userId, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const url = new URL('https://www.pinterest.com/oauth/');
    url.searchParams.set('client_id', this.clientId());
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.scopes);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return { url: url.toString() };
  }

  async callback(code: string, state: string) {
    const oauth = await this.db.oAuthState.findUnique({ where: { state } });
    if (!oauth || oauth.expiresAt < new Date()) throw new UnauthorizedException('INVALID_OAUTH_STATE');
    await this.db.oAuthState.delete({ where: { id: oauth.id } });

    const basic = Buffer.from(`${this.clientId()}:${this.clientSecret()}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri(), continuous_refresh: 'true' });
    const response = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    if (!response.ok) throw new Error(`PINTEREST_TOKEN_EXCHANGE_FAILED:${response.status}`);
    const token: any = await response.json();
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
    const refreshExpiresAt = token.refresh_token_expires_in ? new Date(Date.now() + token.refresh_token_expires_in * 1000) : null;

    await this.db.channelConnection.upsert({
      where: { userId_channel: { userId: oauth.userId, channel: 'PINTEREST' } },
      create: { userId: oauth.userId, channel: 'PINTEREST', status: 'CONNECTED', accessTokenEnc: this.cryptoService.encrypt(token.access_token), refreshTokenEnc: token.refresh_token ? this.cryptoService.encrypt(token.refresh_token) : null, tokenExpiresAt: expiresAt, scopes: token.scope || this.scopes, metadata: JSON.stringify({ refreshTokenExpiresAt: refreshExpiresAt?.toISOString() || null }) },
      update: { status: 'CONNECTED', accessTokenEnc: this.cryptoService.encrypt(token.access_token), refreshTokenEnc: token.refresh_token ? this.cryptoService.encrypt(token.refresh_token) : undefined, tokenExpiresAt: expiresAt, scopes: token.scope || this.scopes, metadata: JSON.stringify({ refreshTokenExpiresAt: refreshExpiresAt?.toISOString() || null }) },
    });
    return { ok: true };
  }

  async status(userId: string) {
    const c = await this.db.channelConnection.findUnique({ where: { userId_channel: { userId, channel: 'PINTEREST' } } });
    return { connected: !!c && c.status === 'CONNECTED', status: c?.status || 'NOT_CONNECTED', scopes: c?.scopes || null, tokenExpiresAt: c?.tokenExpiresAt || null };
  }

  private async connection(userId: string) {
    const c = await this.db.channelConnection.findUnique({ where: { userId_channel: { userId, channel: 'PINTEREST' } } });
    if (!c?.accessTokenEnc) throw new UnauthorizedException('PINTEREST_NOT_CONNECTED');
    if (c.tokenExpiresAt && c.tokenExpiresAt.getTime() < Date.now() + 60_000) return this.refresh(userId);
    return c;
  }

  async refresh(userId: string) {
    const c = await this.db.channelConnection.findUnique({ where: { userId_channel: { userId, channel: 'PINTEREST' } } });
    if (!c?.refreshTokenEnc) throw new UnauthorizedException('PINTEREST_REFRESH_UNAVAILABLE');
    const basic = Buffer.from(`${this.clientId()}:${this.clientSecret()}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.cryptoService.decrypt(c.refreshTokenEnc) });
    const response = await fetch('https://api.pinterest.com/v5/oauth/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) throw new Error(`PINTEREST_REFRESH_FAILED:${response.status}`);
    const token: any = await response.json();
    const updated = await this.db.channelConnection.update({ where: { id: c.id }, data: { status: 'CONNECTED', accessTokenEnc: this.cryptoService.encrypt(token.access_token), refreshTokenEnc: token.refresh_token ? this.cryptoService.encrypt(token.refresh_token) : c.refreshTokenEnc, tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null } });
    return updated;
  }

  private async api(userId: string, path: string, init: RequestInit = {}) {
    const c = await this.connection(userId);
    const token = this.cryptoService.decrypt(c.accessTokenEnc!);
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');
    const response = await fetch(`https://api.pinterest.com/v5${path}`, { ...init, headers });
    if (!response.ok) throw new Error(`PINTEREST_API_${response.status}:${await response.text()}`);
    return response.json();
  }

  async boards(userId: string) { return this.api(userId, '/boards?page_size=100'); }

  async createBoard(userId: string, name: string, description?: string) {
    return this.api(userId, '/boards', { method: 'POST', body: JSON.stringify({ name, description }) });
  }

  async createImagePin(userId: string, input: { boardId: string; title?: string; description?: string; imageUrl: string; link?: string }) {
    return this.api(userId, '/pins', { method: 'POST', body: JSON.stringify({ board_id: input.boardId, title: input.title, description: input.description, link: input.link, media_source: { source_type: 'image_url', url: input.imageUrl } }) });
  }

  async publishContent(userId: string, contentId: string) {
    const content = await this.db.marketingContent.findFirst({ where: { id: contentId, userId, channel: 'PINTEREST' } });
    if (!content) throw new UnauthorizedException('CONTENT_NOT_FOUND');
    if (!content.mediaUrl) throw new Error('PINTEREST_MEDIA_REQUIRED');
    const metadata = content.campaignId ? undefined : undefined;
    void metadata;
    return { ok: false, status: 'READY_FOR_PUBLISH', reason: 'Use createImagePin with a selected board before publication.' };
  }

  async currentUser(req: any) {
    const h = req.headers.authorization || '';
    return this.auth.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
  }
}
