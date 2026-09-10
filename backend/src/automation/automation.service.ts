import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ProductHunterService } from '../products/product-hunter.service';

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private hunter: ProductHunterService) {}

  onModuleInit() {
    const hours = Math.max(1, Number(process.env.HUNTER_INTERVAL_HOURS || 6));
    const delay = hours * 60 * 60 * 1000;
    this.timer = setInterval(() => void this.run(), delay);
    setTimeout(() => void this.run(), 15000);
    this.logger.log(`Product Hunter scheduler enabled: every ${hours}h`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    if (this.running) return { ok: false, reason: 'RUN_ALREADY_IN_PROGRESS' };
    this.running = true;
    try {
      const configured = String(process.env.HUNTER_QUERIES || '').split(',').map((q) => q.trim()).filter(Boolean);
      const queries = configured.length ? configured.slice(0, 12) : [
        'celular', 'notebook', 'fone bluetooth', 'smartwatch', 'eletrodoméstico',
        'casa inteligente', 'beleza', 'fitness', 'acessórios', 'cozinha',
      ];
      const results = [];
      for (const query of queries) {
        try {
          const result = await this.hunter.search(query);
          results.push({ query, total: result.total || 0, ok: true });
        } catch (error) {
          this.logger.warn(`Hunter failed for ${query}: ${String(error)}`);
          results.push({ query, ok: false });
        }
      }
      return { ok: true, queries: results, financialAction: 'NONE' };
    } finally {
      this.running = false;
    }
  }
}
