import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { PinterestModule } from './marketplace/pinterest.module';
import { TikTokModule } from './marketplace/tiktok.module';
import { ProductsModule } from './products/products.module';
import { ScoringModule } from './scoring/scoring.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ContentModule } from './content/content.module';
import { FinanceModule } from './finance/finance.module';
import { StorefrontModule } from './storefront/storefront.module';
import { AutomationModule } from './automation/automation.module';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, MarketplaceModule, PinterestModule, TikTokModule, ProductsModule, ScoringModule, CampaignsModule, ContentModule, FinanceModule, StorefrontModule, AutomationModule],
  controllers: [HealthController],
  providers: [PrismaService, AuthService],
})
export class AppModule implements OnModuleInit {
  constructor(private auth: AuthService) {}
  async onModuleInit() {
    await this.auth.ensureAdmin();
  }
}
