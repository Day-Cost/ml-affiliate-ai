import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ProductHunterService } from './product-hunter.service';

@Injectable()
export class ProductHunterAutoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProductHunterAutoService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly hunter: ProductHunterService) {}

  onModuleInit() {
    // Discovery is read-only and starts after the API is fully available.
    this.timer = setTimeout(() => this.run(), 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private queries(): string[] {
    const configured = String(process.env.MLAI_HUNTER_QUERIES || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
    return configured.length ? configured : [
      'celular',
      'notebook',
      'smart tv',
      'eletrodomésticos',
      'casa e decoração',
      'beleza',
      'moda',
      'acessórios',
      'informática',
      'games',
    ];
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      const ready = await this.hunter.isReadyForAutomation();
      if (!ready.ready) {
        this.logger.log(`Automatic Product Hunter aguardando Mercado Livre conectado: ${ready.reason}`);
        return;
      }

      const queries = this.queries();
      let total = 0;
      for (const query of queries) {
        try {
          const result = await this.hunter.searchForConnectedUser(query);
          total += Number(result?.total || 0);
          this.logger.log(`Automatic Product Hunter query="${query}" realListings=${result?.total || 0}`);
        } catch (error: any) {
          this.logger.warn(`Automatic Product Hunter query="${query}" failed: ${error?.message || 'unknown error'}`);
        }
      }
      this.logger.log(`Automatic Product Hunter finished queries=${queries.length} realListings=${total}`);
    } finally {
      this.running = false;
      this.timer = setTimeout(() => this.run(), 6 * 60 * 60 * 1000);
      this.timer.unref?.();
    }
  }
}
