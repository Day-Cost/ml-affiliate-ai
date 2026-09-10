import { Module } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { TestMediaController } from './test-media.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [AutomationController, TestMediaController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
