import { Controller, Get, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ProductHunterService } from './product-hunter.service';
import { AuthService } from '../auth.service';

@Controller('products')
export class ProductsController {
  constructor(private hunter: ProductHunterService, private auth: AuthService) {}

  private async currentUser(req: Request) {
    const h = req.headers.authorization || '';
    const u = await this.auth.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
    if (!u) throw new UnauthorizedException('UNAUTHORIZED');
    return u;
  }

  @Get('search')
  async search(@Req() req: Request, @Query('q') q: string) {
    await this.currentUser(req);
    return this.hunter.search(q || '');
  }

  @Get('top')
  async top(@Req() req: Request) {
    await this.currentUser(req);
    return this.hunter.top();
  }
}
