import { Body, Controller, Get, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { PinterestService } from './pinterest.service';

@Controller('marketplace/pinterest')
export class PinterestController {
  constructor(private service: PinterestService) {}

  private async user(req: Request) {
    const u = await this.service.currentUser(req);
    if (!u) throw new UnauthorizedException('UNAUTHORIZED');
    return u;
  }

  @Get('connect-url')
  async connectUrl(@Req() req: Request) { return this.service.connectUrl((await this.user(req)).id); }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try { await this.service.callback(code, state); return res.redirect('/?pinterest=connected'); }
    catch (error: any) { const reason = encodeURIComponent(String(error?.message || 'PINTEREST_CONNECTION_FAILED').slice(0, 180)); return res.redirect(`/?pinterest=error&reason=${reason}`); }
  }

  @Get('status')
  async status(@Req() req: Request) { return this.service.status((await this.user(req)).id); }

  @Get('diagnostic')
  async diagnostic(@Req() req: Request) {
    const u = await this.user(req);
    const status = await this.service.status(u.id);
    if (!status.connected) return { ...status, apiReachable: false, reason: 'NOT_CONNECTED' };
    try {
      const boards: any = await this.service.boards(u.id);
      return { ...status, apiReachable: true, boardsCount: Array.isArray(boards?.items) ? boards.items.length : 0, error: null };
    } catch (error: any) {
      return { ...status, apiReachable: false, error: String(error?.message || 'PINTEREST_API_ERROR').slice(0, 220) };
    }
  }

  @Post('refresh')
  async refresh(@Req() req: Request) { return this.service.refresh((await this.user(req)).id); }
  @Get('boards')
  async boards(@Req() req: Request) { return this.service.boards((await this.user(req)).id); }
  @Post('boards')
  async createBoard(@Req() req: Request, @Body() body: { name: string; description?: string }) { return this.service.createBoard((await this.user(req)).id, body.name, body.description); }
  @Post('pins/image')
  async createImagePin(@Req() req: Request, @Body() body: { boardId: string; title?: string; description?: string; imageUrl: string; link?: string }) { return this.service.createImagePin((await this.user(req)).id, body); }
  @Post('pins/video')
  async createVideoPin(@Req() req: Request, @Body() body: { boardId: string; title?: string; description?: string; videoUrl: string; coverImageUrl: string; link?: string }) { return this.service.createVideoPin((await this.user(req)).id, body); }
}
