import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.campaign.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { approvals: { orderBy: { requestedAt: 'desc' }, take: 5 } } });
  }

  async create(userId: string, body: any) {
    const budgetDaily = Number(body.budgetDaily || 0);
    const budgetTotal = Number(body.budgetTotal || 0);
    if (!Number.isFinite(budgetDaily) || budgetDaily < 0 || !Number.isFinite(budgetTotal) || budgetTotal < 0) throw new ForbiddenException('INVALID_BUDGET');
    const campaign = await this.prisma.campaign.create({ data: { userId, name: String(body.name || 'Nova campanha'), objective: String(body.objective || 'AFFILIATE'), budgetDaily, budgetTotal, recommendedBudget: body.recommendedBudget == null ? undefined : Number(body.recommendedBudget), status: 'WAITING_APPROVAL', approvedByUser: false } });
    await this.prisma.approvalRequest.create({ data: { userId, campaignId: campaign.id, action: 'ACTIVATE_CAMPAIGN', status: 'PENDING', amount: budgetDaily > 0 ? budgetDaily : budgetTotal, details: JSON.stringify({ name: campaign.name, objective: campaign.objective }) } });
    return { status: 'WAITING_APPROVAL', requiresApproval: true, campaign };
  }

  async approvals(userId: string) {
    return this.prisma.approvalRequest.findMany({ where: { userId }, orderBy: { requestedAt: 'desc' }, include: { campaign: true } });
  }

  async decide(userId: string, approvalId: string, approve: boolean) {
    const approval = await this.prisma.approvalRequest.findFirst({ where: { id: approvalId, userId } });
    if (!approval) throw new NotFoundException('APPROVAL_NOT_FOUND');
    if (approval.status !== 'PENDING') throw new ForbiddenException('APPROVAL_ALREADY_DECIDED');
    const now = new Date();
    const status = approve ? 'APPROVED' : 'REJECTED';
    await this.prisma.approvalRequest.update({ where: { id: approval.id }, data: { status, decidedAt: now } });
    if (approval.campaignId) await this.prisma.campaign.update({ where: { id: approval.campaignId }, data: approve ? { approvedByUser: true, approvedAt: now, status: 'APPROVED' } : { status: 'REJECTED' } });
    return { ok: true, approvalId, status, financialActionExecuted: false };
  }

  async activate(userId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, userId } });
    if (!campaign) throw new NotFoundException('CAMPAIGN_NOT_FOUND');
    if (!campaign.approvedByUser) throw new ForbiddenException('USER_APPROVAL_REQUIRED');
    return { ok: true, campaignId, status: 'APPROVED', financialActionExecuted: false };
  }

  async requestAction(userId: string, campaignId: string, action: 'PAUSE_AD' | 'DELETE_AD') {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, userId } });
    if (!campaign) throw new NotFoundException('CAMPAIGN_NOT_FOUND');
    const approval = await this.prisma.approvalRequest.create({ data: { userId, campaignId, action, status: 'PENDING', amount: campaign.budgetDaily || campaign.budgetTotal || undefined, details: JSON.stringify({ campaignId, action }) } });
    return { requiresApproval: true, approval };
  }
}
