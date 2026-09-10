import { Body, Controller, Get, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { InstagramService } from './instagram.service';

@Controller('marketplace/instagram')
export class InstagramController {
  constructor(private service: InstagramService) {}
  private async user(req: Request) { const u = await this.service.currentUser(req); if (!u) throw new UnauthorizedException('UNAUTHORIZED'); return u; }
  @Get('connect-url') async connectUrl(@Req() req: Request) { return this.service.connectUrl((await this.user(req)).id); }
  @Get('callback') async callback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string, @Res() res: Response) { if (error) return res.redirect(`/?instagram=error&reason=${encodeURIComponent(error)}`); try { await this.service.callback(code, state); return res.redirect('/?instagram=connected'); } catch (e: any) { return res.redirect(`/?instagram=error&reason=${encodeURIComponent(String(e?.message || 'INSTAGRAM_CONNECTION_FAILED').slice(0,180))}`); } }
  @Get('status') async status(@Req() req: Request) { return this.service.status((await this.user(req)).id); }
  @Get('me') async me(@Req() req: Request) { return this.service.me((await this.user(req)).id); }
  @Post('publish/image') async publishImage(@Req() req: Request, @Body() body: { imageUrl: string; caption?: string; shareToFeed?: boolean }) { if (!body.imageUrl) throw new Error('IMAGE_URL_REQUIRED'); return this.service.createImagePost((await this.user(req)).id, body); }
}