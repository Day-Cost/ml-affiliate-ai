import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductHunterService } from './product-hunter.service';
import { ProductHunterAutoService } from './product-hunter-auto.service';
import { BrowserSearchService } from './browser-search.service';
import { PriceRepairService } from './price-repair.service';
import { SafePendingService } from './safe-pending.service';
import { ScoringModule } from '../scoring/scoring.module';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthModule } from '../auth.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { ContentModule } from '../content/content.module';

@Module({
  imports: [ScoringModule, AuthModule, MarketplaceModule, ContentModule],
  controllers: [ProductsController],
  providers: [ProductHunterService, ProductHunterAutoService, BrowserSearchService, PriceRepairService, SafePendingService, PrismaService, CryptoService],
  exports: [ProductHunterService],
})
export class ProductsModule {}
