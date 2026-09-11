import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ProductHunterService } from './product-hunter.service';
import { BrowserSearchService } from './browser-search.service';
import { AuthService } from '../auth.service';

@Controller('products')
export class ProductsController {
  constructor(private hunter: ProductHunterService, private browserSearch: BrowserSearchService, private auth: AuthService) {}

  private async currentUser(req: Request) {
    const h = req.headers.authorization || '';
    const u = await this.auth.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
    if (!u) throw new UnauthorizedException('UNAUTHORIZED');
    return u;
  }

  @Get('search')
  async search(@Req() req: Request, @Query('q') q: string) { const u = await this.currentUser(req); return this.hunter.search(q || '', u.id); }
  @Post('browser-search-import')
  async browserSearchImport(@Req() req: Request, @Body() body: { results: any[] }) {
    const u = await this.currentUser(req);
    return this.browserSearch.importPublicResults(u.id, body?.results || []);
  }
  @Get('top')
  async top(@Req() req: Request) { await this.currentUser(req); return this.hunter.top(); }
  @Get('affiliate-pending')
  async affiliatePending(@Req() req: Request) { await this.currentUser(req); return this.hunter.pendingAffiliateLinks(); }
  @Post(':id/affiliate-link')
  async affiliateLink(@Req() req: Request, @Param('id') id: string, @Body() body: { affiliateUrl: string }) {
    const u = await this.currentUser(req);
    return this.hunter.setAffiliateUrl(id, body?.affiliateUrl, u.id);
  }
}
