import { Body, Controller, Get, Post, Param, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { ContentService } from './content.service';

@Controller('content')
export class ContentController {
  constructor(private auth: AuthService, private service: ContentService) {}

  private async user(req: Request) {
    const h = req.headers.authorization || '';
    const u = await this.auth.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
    if (!u) throw new UnauthorizedException('UNAUTHORIZED');
    return u;
  }

  @Get()
  async list(@Req() req: Request) { return this.service.list((await this.user(req)).id); }

  @Post('generate')
  async generate(@Req() req: Request, @Body() body: any) { return this.service.generate((await this.user(req)).id, body); }

  @Post(':id/approve')
  async approve(@Req() req: Request, @Param('id') id: string) { return this.service.approve((await this.user(req)).id, id); }

  @Post(':id/publish')
  async publish(@Req() req: Request, @Param('id') id: string) { return this.service.publish((await this.user(req)).id, id); }
}
