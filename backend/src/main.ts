import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1', { exclude: [
    { path: 'store', method: RequestMethod.GET }, { path: 'store/products/:id', method: RequestMethod.GET }, { path: 'go/:id', method: RequestMethod.GET },
    { path: 'privacy', method: RequestMethod.GET }, { path: 'terms', method: RequestMethod.GET }, { path: 'robots.txt', method: RequestMethod.GET }, { path: 'sitemap.xml', method: RequestMethod.GET },
    { path: 'media/test/tiktok.mp4', method: RequestMethod.GET }, { path: 'media/generate/product.mp4', method: RequestMethod.GET },
  ] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.use((req: any, res: any, next: any) => { const prefix = '/tiktok-developers-site-verification='; if (req.path.startsWith(prefix)) return res.type('text/plain').send(req.path.slice(1).replace(/\.txt$/, '')); next(); });
  app.use(express.static(path.join(process.cwd(), '../frontend')));
  app.getHttpAdapter().get('/', (_req, res) => res.sendFile(path.join(process.cwd(), '../frontend/index.html')));
  const config = new DocumentBuilder().setTitle('ML Affiliate AI').setVersion('2.0').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}
bootstrap();
