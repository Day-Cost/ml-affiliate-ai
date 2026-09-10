import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductHunterService } from './product-hunter.service';
import { ScoringModule } from '../scoring/scoring.module';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth.module';

@Module({
  imports: [ScoringModule, AuthModule],
  controllers: [ProductsController],
  providers: [ProductHunterService, PrismaService],
  exports: [ProductHunterService],
})
export class ProductsModule {}
