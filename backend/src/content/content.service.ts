import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) { return this.prisma.marketingContent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }); }

  async generate(userId: string, body: any) {
    const channel = String(body.channel || 'WEB').toUpperCase();
    const type = String(body.contentType || 'POST').toUpperCase();
    const productId = body.productId ? String(body.productId) : undefined;
    const product = productId ? await this.prisma.product.findUnique({ where: { id: productId } }) : null;
    if (productId && !product) throw new NotFoundException('PRODUCT_NOT_FOUND');
    const title = product?.title || String(body.title || 'Oferta selecionada pelo ML Affiliate AI');
    const affiliateUrl = product?.affiliateUrl || null;
    const caption = `Confira ${title}. ${product?.discountPercent ? `Desconto de ${product.discountPercent}%. ` : ''}${affiliateUrl ? `Acesse pelo link de afiliado: ${affiliateUrl}` : 'Link de afiliado ainda não vinculado.'}`;
    const script = `Gancho: ${title}.\nBenefício: destaque apenas benefícios reais do produto.\nOferta: apresente preço/desconto somente quando confirmado.\nCTA: use o link oficial de afiliado quando ele estiver vinculado.`;
    return this.prisma.marketingContent.create({ data: { userId, productId, channel, contentType: type, title, caption, script: type.includes('VIDEO') || type === 'REEL' ? script : null, affiliateUrl, aiGenerated: false, status: 'DRAFT', publishMode: channel === 'WEB' ? 'AUTO' : 'MANUAL' } });
  }

  async approve(userId: string, id: string) {
    const item = await this.prisma.marketingContent.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('CONTENT_NOT_FOUND');
    return this.prisma.marketingContent.update({ where: { id }, data: { approved: true, status: 'APPROVED' } });
  }

  async publish(userId: string, id: string) {
    const item = await this.prisma.marketingContent.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('CONTENT_NOT_FOUND');
    if (!item.approved) throw new ForbiddenException('CONTENT_APPROVAL_REQUIRED');
    if ((item.channel === 'TIKTOK' || item.channel === 'INSTAGRAM' || item.channel === 'PINTEREST') && !item.affiliateUrl) throw new ForbiddenException('AFFILIATE_LINK_REQUIRED');
    if (item.channel === 'TIKTOK' || item.channel === 'INSTAGRAM' || item.channel === 'PINTEREST') return { ok: false, status: 'OFFICIAL_API_PUBLISHER_REQUIRED', contentId: id };
    if (item.channel === 'WEB') return this.prisma.marketingContent.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishMode: 'AUTO' } });
    return { ok: false, status: 'MANUAL_REQUIRED', contentId: id };
  }
}
