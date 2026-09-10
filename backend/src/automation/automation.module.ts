import { Module } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { ProductsModule } from '../products/products.module';

@Module({ imports: [ProductsModule], providers: [AutomationService], exports: [AutomationService] })
export class AutomationModule {}
