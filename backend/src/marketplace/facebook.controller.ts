import { Body, Controller, Get, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { FacebookService } from './facebook.service';

@Controller('marketplace/facebook')
export class FacebookController {
  constructor(private service: FacebookService) {}
  private async user(req: Request) {
    const u = await this.service.currentUser(req);
    if (!u) throw new UnauthorizedException('UNAUTHORIZED');
    return u;
  }
  @Get('connect-url')
  async connectUrl(@Req() req: Request) { return this.service.connectUrl((await this.user(req)).id); }
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string, @Res() res: Response) {
    if (error) return res.redirect(`/?facebook=error&reason=${encodeURIComponent(error)}`);
    try { await this.service.callback(code, state); return res.redirect('/?facebook=connected'); }
    catch (e: any) { return res.redirect(`/?facebook=error&reason=${encodeURIComponent(String(e?.message || 'FACEBOOK_CONNECTION_FAILED').slice(0, 180))}`); }
  }
  @Get('status')
  async status(@Req() req: Request) { return this.service.status((await this.user(req)).id); }
  @Get('pages')
  async pages(@Req() req: Request) { return this.service.pages((await this.user(req)).id); }
  @Post('select-page')
  async selectPage(@Req() req: Request, @Body() body: { pageId: string }) {
    if (!body.pageId) throw new Error('PAGE_ID_REQUIRED');
    return this.service.selectPage((await this.user(req)).id, body.pageId);
  }
  @Get('me')
  async me(@Req() req: Request) { return this.service.me((await this.user(req)).id); }
  @Post('publish/text')
  async publishText(@Req() req: Request, @Body() body: { message: string; link?: string }) {
    if (!body.message?.trim()) throw new Error('MESSAGE_REQUIRED');
    return this.service.publishText((await this.user(req)).id, body);
  }
  @Post('publish/image')
  async publishImage(@Req() req: Request, @Body() body: { imageUrl: string; caption?: string }) {
    if (!body.imageUrl?.trim()) throw new Error('IMAGE_URL_REQUIRED');
    return this.service.publishImage((await this.user(req)).id, body);
  }
}
