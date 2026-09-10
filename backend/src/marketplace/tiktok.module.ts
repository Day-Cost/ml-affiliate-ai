import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TikTokController } from './tiktok.controller';
import { TikTokService } from './tiktok.service';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthModule } from '../auth.module';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [TikTokController],
  providers: [TikTokService, PrismaService, CryptoService],
})
export class TikTokModule {}
