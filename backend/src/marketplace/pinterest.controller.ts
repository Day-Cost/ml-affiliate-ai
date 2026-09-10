import { Body, Controller, Get, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PinterestService } from './pinterest.service';

@Controller('marketplace/pinterest')
export class PinterestController {
  constructor(private service: PinterestService) {}

  private async user(req: Request) {
    const h = req.headers.authorization || '';
    const u = await this.service.currentUser(req);
    if (!u) throw new UnauthorizedException('UNAUTHORIZED');
    return u;
  }

  @Get('connect-url')
  async connectUrl(@Req() req: Request) { return this.service.connectUrl((await this.user(req)).id); }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string) { return this.service.callback(code, state); }

  @Get('status')
  async status(@Req() req: Request) { return this.service.status((await this.user(req)).id); }

  @Post('refresh')
  async refresh(@Req() req: Request) { return this.service.refresh((await this.user(req)).id); }

  @Get('boards')
  async boards(@Req() req: Request) { return this.service.boards((await this.user(req)).id); }

  @Post('boards')
  async createBoard(@Req() req: Request, @Body() body: { name: string; description?: string }) { return this.service.createBoard((await this.user(req)).id, body.name, body.description); }

  @Post('pins/image')
  async createImagePin(@Req() req: Request, @Body() body: { boardId: string; title?: string; description?: string; imageUrl: string; link?: string }) { return this.service.createImagePin((await this.user(req)).id, body); }
}
