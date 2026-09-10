import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PinterestController } from './pinterest.controller';
import { PinterestService } from './pinterest.service';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthModule } from '../auth.module';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [PinterestController],
  providers: [PinterestService, PrismaService, CryptoService],
})
export class PinterestModule {}
