import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FacebookController } from './facebook.controller';
import { FacebookService } from './facebook.service';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthModule } from '../auth.module';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [FacebookController],
  providers: [FacebookService, PrismaService, CryptoService],
})
export class FacebookModule {}
