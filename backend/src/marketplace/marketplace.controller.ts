import { Controller, Get, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
import { MercadoLivreService } from './mercadolivre.service';
import { AuthService } from '../auth.service';

@Controller('marketplace/mercadolivre')
export class MarketplaceController {
  constructor(private ml: MercadoLivreService, private auth: AuthService) {}

  private async currentUser(req: Request) {
    const a = req.headers.authorization || '';
    const u = await this.auth.userFromToken(a.startsWith('Bearer ') ? a.slice(7) : undefined);
    if (!u) throw new UnauthorizedException('UNAUTHORIZED');
    return u;
  }

  @Get('connect-url')
  async connectUrl(@Req() req: Request) { return { url: await this.ml.getAuthorizationUrl((await this.currentUser(req)).id) }; }

  @Get('connect')
  async connect(@Req() req: Request, @Res() res: Response) { return res.redirect(await this.ml.getAuthorizationUrl((await this.currentUser(req)).id)); }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string) { return this.ml.exchangeCode(code, state); }

  @Get('status')
  async status(@Req() req: Request) { return this.ml.status((await this.currentUser(req)).id); }

  @Get('account')
  async account(@Req() req: Request) { return this.ml.account((await this.currentUser(req)).id); }

  @Post('sync')
  async sync(@Req() req: Request) { return this.ml.account((await this.currentUser(req)).id); }

  @Post('refresh')
  async refresh(@Req() req: Request) { return this.ml.refresh((await this.currentUser(req)).id); }
}
