import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth.service';

@Module({ controllers: [ContentController], providers: [ContentService, PrismaService, AuthService] })
export class ContentModule {}
