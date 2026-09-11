import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductHunterService } from './product-hunter.service';
import { BrowserSearchService } from './browser-search.service';
import { ScoringModule } from '../scoring/scoring.module';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthModule } from '../auth.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';

@Module({
  imports: [ScoringModule, AuthModule, MarketplaceModule],
  controllers: [ProductsController],
  providers: [ProductHunterService, BrowserSearchService, PrismaService, CryptoService],
  exports: [ProductHunterService],
})
export class ProductsModule {}
