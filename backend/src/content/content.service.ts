import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

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
    const title = product?.title || String(body.title || 'Oferta selecionada pelo ML Affiliate AI');
    const affiliateUrl = product?.affiliateUrl || product?.productUrl || null;
    const caption = `Confira ${title}. ${product?.discountPercent ? `Desconto de ${product.discountPercent}%. ` : ''}${affiliateUrl ? `Acesse pelo link oficial: ${affiliateUrl}` : 'Link de afiliado ainda não disponível.'}`;
    const script = `Gancho: ${title}.\nBenefício: destaque os principais benefícios reais do produto.\nOferta: apresente preço/desconto somente quando confirmado.\nCTA: veja os detalhes pelo nosso site e, quando disponível, siga o link oficial de afiliado.`;
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
    if (item.channel === 'TIKTOK' || item.channel === 'INSTAGRAM') {
      return { ok: false, status: 'NOT_CONNECTED', reason: 'OFFICIAL_API_CONNECTION_REQUIRED', contentId: id };
    }
    if (item.channel === 'WEB') {
      return this.prisma.marketingContent.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishMode: 'AUTO' } });
    }
    return { ok: false, status: 'MANUAL_REQUIRED', contentId: id };
  }
}
