import { Module } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { TestMediaController } from './test-media.controller';
import { ProductVideoController } from './product-video.controller';
import { ProductsModule } from '../products/products.module';
import { AuthModule } from '../auth.module';

@Module({
  imports: [ProductsModule, AuthModule],
  controllers: [AutomationController, TestMediaController, ProductVideoController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
