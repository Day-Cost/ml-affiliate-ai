import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(private db: PrismaService) {}

  hash(s: string) {
    return crypto.createHash('sha256').update(s).digest('hex');
  }

  async ensureAdmin() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;

    const passwordHash = this.hash(password);
    const existing = await this.db.user.findUnique({ where: { email } });

    if (!existing) {
      await this.db.user.create({
        data: { name: 'Administrador', email, passwordHash },
      });
      return;
    }

    // Keep the admin credentials synchronized with the private Render env vars.
    if (existing.passwordHash !== passwordHash) {
      await this.db.user.update({
        where: { id: existing.id },
        data: { passwordHash },
      });
    }
  }

  async login(email: string, password: string) {
    const normalizedEmail = email?.trim().toLowerCase();
    const u = await this.db.user.findUnique({ where: { email: normalizedEmail } });
    if (!u || u.passwordHash !== this.hash(password)) {
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    const token = crypto.randomBytes(32).toString('hex');
    await this.db.session.create({
      data: {
        tokenHash: this.hash(token),
        userId: u.id,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    return { token, user: { id: u.id, name: u.name, email: u.email } };
  }

  async userFromToken(token?: string) {
    if (!token) return null;
    const s = await this.db.session.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });
    if (!s || s.expiresAt < new Date()) return null;
    return s.user;
  }

  async logout(token: string) {
    if (token) await this.db.session.deleteMany({ where: { tokenHash: this.hash(token) } });
    return { ok: true };
  }
}
