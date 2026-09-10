import { Body, Controller, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { CampaignsService } from './campaigns.service';
import { AuthService } from '../auth.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(private service: CampaignsService, private auth: AuthService) {}

  private async user(req: Request) {
    const h = req.headers.authorization || '';
    const u = await this.auth.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
    if (!u) throw new UnauthorizedException('UNAUTHORIZED');
    return u;
  }

  @Get()
  async list(@Req() req: Request) { return this.service.list((await this.user(req)).id); }

  @Get('approvals')
  async approvals(@Req() req: Request) { return this.service.approvals((await this.user(req)).id); }

  @Post()
  async create(@Req() req: Request, @Body() body: any) { return this.service.create((await this.user(req)).id, body); }

  @Post('approvals/:id/approve')
  async approve(@Req() req: Request, @Param('id') id: string) { return this.service.decide((await this.user(req)).id, id, true); }

  @Post('approvals/:id/reject')
  async reject(@Req() req: Request, @Param('id') id: string) { return this.service.decide((await this.user(req)).id, id, false); }

  @Post(':id/activate')
  async activate(@Req() req: Request, @Param('id') id: string) { return this.service.activate((await this.user(req)).id, id); }
}
