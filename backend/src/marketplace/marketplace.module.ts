import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MarketplaceController } from './marketplace.controller';
import { MercadoLivreService } from './mercadolivre.service';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthModule } from '../auth.module';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [MarketplaceController],
  providers: [MercadoLivreService, PrismaService, CryptoService],
  exports: [MercadoLivreService],
})
export class MarketplaceModule {}
