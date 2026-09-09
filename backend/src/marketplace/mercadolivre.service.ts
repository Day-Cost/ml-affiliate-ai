import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';

@Injectable()
export class MercadoLivreService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  async getAuthorizationUrl(userId: string) {
    const state = randomBytes(24).toString('hex');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    await this.prisma.oAuthState.create({
      data: { state, codeVerifier: verifier, userId, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    const p = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.getOrThrow('ML_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow('ML_REDIRECT_URI'),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const me = await axios.get('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    await this.prisma.marketplaceAccount.upsert({
      where: { userId_marketplace: { userId: oauth.userId, marketplace: 'MERCADOLIVRE' } },
      create: {
        userId: oauth.userId,
        marketplace: 'MERCADOLIVRE',
        externalUserId: BigInt(me.data.id),
        accessTokenEncrypted: this.crypto.encrypt(data.access_token),
        refreshTokenEncrypted: this.crypto.encrypt(data.refresh_token),
        tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
        status: 'CONNECTED',
      },
      update: {
        externalUserId: BigInt(me.data.id),
        accessTokenEncrypted: this.crypto.encrypt(data.access_token),
        refreshTokenEncrypted: this.crypto.encrypt(data.refresh_token),
        tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
        status: 'CONNECTED',
      },
    });
    await this.prisma.oAuthState.delete({ where: { state } });
    return { connected: true, mercadoLivreUserId: me.data.id, expiresIn: data.expires_in, scope: data.scope };
  }

  async refresh(userId: string) {
    const acc = await this.prisma.marketplaceAccount.findUnique({ where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } } });
    if (!acc) throw new UnauthorizedException('MERCADO_LIVRE_NOT_CONNECTED');
    const refreshToken = this.crypto.decrypt(acc.refreshTokenEncrypted);
    const payload = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.getOrThrow('ML_CLIENT_ID'),
      client_secret: this.config.getOrThrow('ML_CLIENT_SECRET'),
      refresh_token: refreshToken,
    });
    const { data } = await axios.post('https://api.mercadolibre.com/oauth/token', payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    await this.prisma.marketplaceAccount.update({
      where: { id: acc.id },
      data: {
        accessTokenEncrypted: this.crypto.encrypt(data.access_token),
        refreshTokenEncrypted: this.crypto.encrypt(data.refresh_token),
        tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
        status: 'CONNECTED',
      },
    });
    return { refreshed: true, expiresIn: data.expires_in };
  }

  async status(userId: string) {
    const acc = await this.prisma.marketplaceAccount.findUnique({
      where: { userId_marketplace: { userId, marketplace: 'MERCADOLIVRE' } },
    });
    return {
      configured: Boolean(this.config.get('ML_CLIENT_ID') && this.config.get('ML_CLIENT_SECRET')),
      connected: Boolean(acc),
      status: acc ? 'CONNECTED' : 'NOT_CONNECTED',
      expiresAt: acc?.tokenExpiresAt || null,
    };
  }
}