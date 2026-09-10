import { Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AutomationService } from './automation.service';
import { AuthService } from '../auth.service';

@Controller('automation')
export class AutomationController {
  constructor(private service: AutomationService, private auth: AuthService) {}

  private async check(req: Request) {
    const key = process.env.AUTOMATION_KEY || '';
    if (key && req.headers['x-automation-key'] === key) return;
    const h = req.headers.authorization || '';
    const user = await this.auth.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
    if (!user) throw new UnauthorizedException('UNAUTHORIZED');
  }

  @Get('status')
  async status(@Req() req: Request) {
    await this.check(req);
    return this.service.status();
  }

  @Post('run')
  async run(@Req() req: Request) {
    await this.check(req);
    return this.service.run();
  }
}
