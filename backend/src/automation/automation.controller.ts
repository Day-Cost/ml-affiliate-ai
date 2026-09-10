import { Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AutomationService } from './automation.service';

@Controller('automation')
export class AutomationController {
  constructor(private service: AutomationService) {}

  private check(req: Request) {
    const key = process.env.AUTOMATION_KEY || '';
    if (!key || req.headers['x-automation-key'] !== key) throw new UnauthorizedException('AUTOMATION_KEY_REQUIRED');
  }

  @Get('status')
  status(@Req() req: Request) {
    this.check(req);
    return this.service.status();
  }

  @Post('run')
  run(@Req() req: Request) {
    this.check(req);
    return this.service.run();
  }
}
