import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const FINANCIAL_ACTIONS = new Set([
  'REFUND', 'RETURN', 'CANCEL_SALE', 'DELETE_AD', 'PAUSE_AD', 'CHANGE_PRICE',
  'ACTIVATE_PAID_AD', 'INCREASE_BUDGET', 'DECREASE_BUDGET', 'SPEND', 'WITHDRAW',
  'TRANSFER', 'FINANCIAL_CONFIGURATION', 'ACTIVATE_CAMPAIGN'
]);

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.approvalRequest.findMany({ where: { userId }, orderBy: { requestedAt: 'desc' }, include: { campaign: true } });
  }

  async request(userId: string, body: any) {
    const action = String(body.action || '').toUpperCase();
    if (!FINANCIAL_ACTIONS.has(action)) throw new ForbiddenException('FINANCIAL_ACTION_NOT_ALLOWED');
    const amount = body.amount == null ? undefined : Number(body.amount);
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) throw new ForbiddenException('INVALID_AMOUNT');
    const request = await this.prisma.approvalRequest.create({ data: { userId, action, amount, details: JSON.stringify(body.details || {}) } });
    return { approved: false, requiresUserApproval: true, request };
  }

  async decide(userId: string, id: string, approve: boolean) {
    const req = await this.prisma.approvalRequest.findFirst({ where: { id, userId } });
    if (!req) throw new NotFoundException('APPROVAL_NOT_FOUND');
    if (req.status !== 'PENDING') throw new ForbiddenException('APPROVAL_ALREADY_DECIDED');
    const status = approve ? 'APPROVED' : 'REJECTED';
    await this.prisma.approvalRequest.update({ where: { id }, data: { status, decidedAt: new Date() } });
    return { ok: true, requestId: id, status, financialActionExecuted: false, note: approve ? 'Approval recorded. Execution remains blocked until the specific official marketplace/channel executor is enabled.' : 'Action rejected and remains blocked.' };
  }
}
