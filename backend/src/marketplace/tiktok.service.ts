import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthService } from '../auth.service';

@Injectable()
export class TikTokService {
  private readonly scopes = 'user.info.basic,video.publish';

  constructor(
    private db: PrismaService,
    private cryptoService: CryptoService,
    private config: ConfigService,
    private auth: AuthService,
  ) {}

  private clientKey() { return this.config.get<string>('TIKTOK_CLIENT_KEY') || ''; }
  private clientSecret() { return this.config.get<string>('TIKTOK_CLIENT_SECRET') || ''; }
  private redirectUri() {
    return this.config.get<string>('TIKTOK_REDIRECT_URI') || `${this.config.get<string>('APP_URL')}/api/v1/marketplace/tiktok/callback`;
  }
  isConfigured() { return !!this.clientKey() && !!this.clientSecret(); }

  async connectUrl(userId: string) {
    if (!this.isConfigured()) throw new Error('TIKTOK_APP_NOT_CONFIGURED');
    const state = crypto.randomBytes(24).toString('hex');
    await this.db.oAuthState.create({
      data: {
        state,
        codeVerifier: crypto.randomBytes(32).toString('base64url'),
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.searchParams.set('client_key', this.clientKey());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.scopes);
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('state', state);
    return { url: url.toString() };
  }

  async callback(code: string, state: string) {
    const oauth = await this.db.oAuthState.findUnique({ where: { state } });
    if (!oauth || oauth.expiresAt < new Date()) throw new UnauthorizedException('INVALID_OAUTH_STATE');
    await this.db.oAuthState.delete({ where: { id: oauth.id } });

    const body = new URLSearchParams({
      client_key: this.clientKey(),
      client_secret: this.clientSecret(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri(),
    });
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body,
    });
    if (!response.ok) throw new Error(`TIKTOK_TOKEN_EXCHANGE_FAILED:${response.status}`);
    const token: any = await response.json();
    if (!token.access_token) throw new Error(`TIKTOK_TOKEN_EXCHANGE_FAILED:${token.error || 'NO_ACCESS_TOKEN'}`);

    await this.db.channelConnection.upsert({
      where: { userId_channel: { userId: oauth.userId, channel: 'TIKTOK' } },
      create: {
        userId: oauth.userId,
        channel: 'TIKTOK',
        status: 'CONNECTED',
        externalUserId: token.open_id || null,
        accessTokenEnc: this.cryptoService.encrypt(token.access_token),
        refreshTokenEnc: token.refresh_token ? this.cryptoService.encrypt(token.refresh_token) : null,
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
        scopes: token.scope || this.scopes,
        metadata: JSON.stringify({ refreshExpiresIn: token.refresh_expires_in || null }),
      },
      update: {
        status: 'CONNECTED',
        externalUserId: token.open_id || undefined,
        accessTokenEnc: this.cryptoService.encrypt(token.access_token),
        refreshTokenEnc: token.refresh_token ? this.cryptoService.encrypt(token.refresh_token) : undefined,
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
        scopes: token.scope || this.scopes,
        metadata: JSON.stringify({ refreshExpiresIn: token.refresh_expires_in || null }),
      },
    });
    return { ok: true, userId: oauth.userId };
  }

  async status(userId: string) {
    const c = await this.db.channelConnection.findUnique({ where: { userId_channel: { userId, channel: 'TIKTOK' } } });
    return {
      configured: this.isConfigured(),
      connected: !!c && c.status === 'CONNECTED',
      status: c?.status || 'NOT_CONNECTED',
      scopes: c?.scopes || null,
      tokenExpiresAt: c?.tokenExpiresAt || null,
      externalUserId: c?.externalUserId || null,
    };
  }

  private async connection(userId: string) {
    const c = await this.db.channelConnection.findUnique({ where: { userId_channel: { userId, channel: 'TIKTOK' } } });
    if (!c?.accessTokenEnc) throw new UnauthorizedException('TIKTOK_NOT_CONNECTED');
    if (c.tokenExpiresAt && c.tokenExpiresAt.getTime() < Date.now() + 60_000) return this.refresh(userId);
    return c;
  }

  async refresh(userId: string) {
    const c = await this.db.channelConnection.findUnique({ where: { userId_channel: { userId, channel: 'TIKTOK' } } });
    if (!c?.refreshTokenEnc) throw new UnauthorizedException('TIKTOK_REFRESH_UNAVAILABLE');
    const body = new URLSearchParams({
      client_key: this.clientKey(),
      client_secret: this.clientSecret(),
      grant_type: 'refresh_token',
      refresh_token: this.cryptoService.decrypt(c.refreshTokenEnc),
    });
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body,
    });
    if (!response.ok) throw new Error(`TIKTOK_REFRESH_FAILED:${response.status}`);
    const token: any = await response.json();
    return this.db.channelConnection.update({
      where: { id: c.id },
      data: {
        status: 'CONNECTED',
        externalUserId: token.open_id || c.externalUserId,
        accessTokenEnc: this.cryptoService.encrypt(token.access_token),
        refreshTokenEnc: token.refresh_token ? this.cryptoService.encrypt(token.refresh_token) : c.refreshTokenEnc,
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
        scopes: token.scope || c.scopes,
        metadata: JSON.stringify({ refreshExpiresIn: token.refresh_expires_in || null }),
      },
    });
  }

  private async api(userId: string, path: string, init: RequestInit = {}) {
    const c = await this.connection(userId);
    const token = this.cryptoService.decrypt(c.accessTokenEnc!);
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json; charset=UTF-8');
    const response = await fetch(`https://open.tiktokapis.com${path}`, { ...init, headers });
    if (!response.ok) throw new Error(`TIKTOK_API_${response.status}:${await response.text()}`);
    return response.json();
  }

  async creatorInfo(userId: string) {
    return this.api(userId, '/v2/post/publish/creator_info/query/', { method: 'POST', body: '{}' });
  }

  async publishVideo(userId: string, input: {
    videoUrl: string;
    title?: string;
    privacyLevel?: string;
    disableComment?: boolean;
    disableDuet?: boolean;
    disableStitch?: boolean;
    isAigc?: boolean;
    videoCoverTimestampMs?: number;
  }) {
    const c = await this.connection(userId);
    const token = this.cryptoService.decrypt(c.accessTokenEnc!);
    const creator = await this.creatorInfo(userId);
    const options = creator?.data?.privacy_level_options || [];
    const privacyLevel = input.privacyLevel && options.includes(input.privacyLevel)
      ? input.privacyLevel
      : options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : options[0];
    if (!privacyLevel) throw new Error('TIKTOK_NO_PRIVACY_LEVEL_AVAILABLE');

    const source = await fetch(input.videoUrl);
    if (!source.ok) throw new Error(`TIKTOK_VIDEO_SOURCE_${source.status}`);
    const contentType = source.headers.get('content-type') || 'video/mp4';
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(contentType.split(';')[0])) {
      throw new Error('TIKTOK_UNSUPPORTED_VIDEO_TYPE');
    }
    const bytes = Buffer.from(await source.arrayBuffer());
    const maxBytes = 4 * 1024 * 1024 * 1024;
    if (!bytes.length || bytes.length > maxBytes) throw new Error('TIKTOK_VIDEO_SIZE_INVALID');

    const chunkSize = bytes.length < 5 * 1024 * 1024 ? bytes.length : Math.min(64 * 1024 * 1024, bytes.length);
    const totalChunks = Math.ceil(bytes.length / chunkSize);
    const init = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        post_info: {
          title: input.title || undefined,
          privacy_level: privacyLevel,
          disable_comment: input.disableComment ?? false,
          disable_duet: input.disableDuet ?? false,
          disable_stitch: input.disableStitch ?? false,
          is_aigc: input.isAigc ?? true,
          video_cover_timestamp_ms: input.videoCoverTimestampMs ?? 1000,
        },
        source_info: { source: 'FILE_UPLOAD', video_size: bytes.length, chunk_size: chunkSize, total_chunk_count: totalChunks },
      }),
    });
    if (!init.ok) throw new Error(`TIKTOK_PUBLISH_INIT_${init.status}:${await init.text()}`);
    const initResult: any = await init.json();
    if (!initResult?.data?.upload_url || !initResult?.data?.publish_id) throw new Error('TIKTOK_PUBLISH_INIT_INVALID');

    for (let index = 0; index < totalChunks; index++) {
      const start = index * chunkSize;
      const end = Math.min(bytes.length, start + chunkSize);
      const chunk = bytes.subarray(start, end);
      const upload = await fetch(initResult.data.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType.split(';')[0],
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${end - 1}/${bytes.length}`,
        },
        body: chunk,
      });
      if (![201, 206].includes(upload.status)) throw new Error(`TIKTOK_VIDEO_UPLOAD_${upload.status}:${await upload.text()}`);
    }
    return { publishId: initResult.data.publish_id, status: 'PROCESSING' };
  }

  async publishStatus(userId: string, publishId: string) {
    return this.api(userId, '/v2/post/publish/status/fetch/', { method: 'POST', body: JSON.stringify({ publish_id: publishId }) });
  }

  async currentUser(req: any) {
    const h = req.headers.authorization || '';
    return this.auth.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
  }
}
