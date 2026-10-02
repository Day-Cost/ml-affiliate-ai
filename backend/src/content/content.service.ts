import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { buildEcommerceStrategy } from './content-strategy';

@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.marketingContent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async generate(userId: string, body: any) {
    const channel = String(body.channel || 'WEB').toUpperCase();
    const type = String(body.contentType || 'POST').toUpperCase();
    const productId = body.productId ? String(body.productId) : undefined;
    const product = productId ? await this.prisma.product.findUnique({ where: { id: productId } }) : null;
    if (productId && !product) throw new NotFoundException('PRODUCT_NOT_FOUND');
    if (productId && !product?.affiliateUrl) throw new ForbiddenException('AFFILIATE_LINK_REQUIRED');

    const source: any = product || { title: String(body.title || 'Produto selecionado pelo Orus') };
    const strategy = buildEcommerceStrategy(source);
    const affiliateUrl = product?.affiliateUrl || null;
    const title = strategy.title;

    const caption = channel === 'INSTAGRAM'
      ? strategy.instagram.caption
      : channel === 'PINTEREST'
        ? strategy.pinterest.description
        : channel === 'WEB'
          ? strategy.body_html
          : strategy.tiktok.script;

    const script = channel === 'TIKTOK' || type.includes('VIDEO') || type === 'REEL'
      ? strategy.tiktok.script
      : channel === 'INSTAGRAM'
        ? strategy.instagram.caption
        : channel === 'PINTEREST'
          ? JSON.stringify(strategy.pinterest)
          : null;

    const saved = await this.prisma.marketingContent.create({
      data: {
        userId,
        productId,
        channel,
        contentType: type,
        title,
        caption,
        script,
        affiliateUrl,
        aiGenerated: true,
        status: 'DRAFT',
        publishMode: channel === 'WEB' ? 'AUTO' : 'MANUAL',
      },
    });

    return {
      ...strategy,
      id: saved.id,
      status: saved.status,
      caption,
      script,
      affiliateUrl,
    };
  }

  async approve(userId: string, id: string) {
    const item = await this.prisma.marketingContent.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('CONTENT_NOT_FOUND');
    if (!item.affiliateUrl) throw new ForbiddenException('AFFILIATE_LINK_REQUIRED');
    return this.prisma.marketingContent.update({ where: { id }, data: { approved: true, status: 'APPROVED' } });
  }

  async publish(userId: string, id: string) {
    const item = await this.prisma.marketingContent.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('CONTENT_NOT_FOUND');
    if (!item.affiliateUrl) throw new ForbiddenException('AFFILIATE_LINK_REQUIRED');
    if (!item.approved) throw new ForbiddenException('CONTENT_APPROVAL_REQUIRED');
    if (item.channel === 'TIKTOK' || item.channel === 'INSTAGRAM' || item.channel === 'PINTEREST') return { ok: false, status: 'OFFICIAL_API_PUBLISHER_REQUIRED', contentId: id };
    if (item.channel === 'WEB') return this.prisma.marketingContent.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishMode: 'AUTO' } });
    return { ok: false, status: 'MANUAL_REQUIRED', contentId: id };
  }
}
