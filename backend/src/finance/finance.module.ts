import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth.service';

@Module({ controllers: [FinanceController], providers: [FinanceService, PrismaService, AuthService] })
export class FinanceModule {}
