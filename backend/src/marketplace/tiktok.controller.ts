import { Body, Controller, Get, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { TikTokService } from './tiktok.service';

@Controller('marketplace/tiktok')
export class TikTokController {
  constructor(private service: TikTokService) {}

  private async user(req: Request) {
    const u = await this.service.currentUser(req);
    if (!u) throw new UnauthorizedException('UNAUTHORIZED');
    return u;
  }

  @Get('connect-url')
  async connectUrl(@Req() req: Request) { return this.service.connectUrl((await this.user(req)).id); }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string, @Res() res: Response) {
    if (error) return res.redirect(`/?tiktok=error&reason=${encodeURIComponent(error)}`);
    try {
      await this.service.callback(code, state);
      return res.redirect('/?tiktok=connected');
    } catch (e: any) {
      const reason = encodeURIComponent(String(e?.message || 'TIKTOK_CONNECTION_FAILED').slice(0, 180));
      return res.redirect(`/?tiktok=error&reason=${reason}`);
    }
  }

  @Get('status')
  async status(@Req() req: Request) { return this.service.status((await this.user(req)).id); }

  @Post('refresh')
  async refresh(@Req() req: Request) { return this.service.refresh((await this.user(req)).id); }

  @Get('creator-info')
  async creatorInfo(@Req() req: Request) { return this.service.creatorInfo((await this.user(req)).id); }

  @Post('publish/video')
  async publishVideo(@Req() req: Request, @Body() body: {
    videoUrl: string;
    title?: string;
    privacyLevel?: string;
    disableComment?: boolean;
    disableDuet?: boolean;
    disableStitch?: boolean;
    isAigc?: boolean;
    videoCoverTimestampMs?: number;
  }) {
    return this.service.publishVideo((await this.user(req)).id, body);
  }

  @Post('publish/status')
  async publishStatus(@Req() req: Request, @Body() body: { publishId: string }) {
    return this.service.publishStatus((await this.user(req)).id, body.publishId);
  }
}
