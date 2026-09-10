import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthModule } from '../auth.module';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [InstagramController],
  providers: [InstagramService, PrismaService, CryptoService],
})
export class InstagramModule {}