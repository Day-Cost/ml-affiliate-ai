import { Body, Controller, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private auth: AuthService, private service: FinanceService) {}

  private async user(req: Request) {
    const h = req.headers.authorization || '';
    const u = await this.auth.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
    if (!u) throw new UnauthorizedException('UNAUTHORIZED');
    return u;
  }

  @Get('approvals')
  async list(@Req() req: Request) { return this.service.list((await this.user(req)).id); }

  @Post('approval-requests')
  async request(@Req() req: Request, @Body() body: any) { return this.service.request((await this.user(req)).id, body); }

  @Post('approvals/:id/approve')
  async approve(@Req() req: Request, @Param('id') id: string) { return this.service.decide((await this.user(req)).id, id, true); }

  @Post('approvals/:id/reject')
  async reject(@Req() req: Request, @Param('id') id: string) { return this.service.decide((await this.user(req)).id, id, false); }
}
