import { Module } from '@nestjs/common';
import { StorefrontController } from './storefront.controller';
import { PrismaService } from '../prisma.service';

@Module({ controllers: [StorefrontController], providers: [PrismaService] })
export class StorefrontModule {}
