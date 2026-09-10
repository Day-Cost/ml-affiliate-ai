import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ProductHunterService } from '../products/product-hunter.service';

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastRunAt: Date | null = null;
  private lastResult: any = null;

  constructor(private hunter: ProductHunterService) {}

  onModuleInit() {
    const hours = Math.max(1, Number(process.env.HUNTER_INTERVAL_HOURS || 6));
    this.timer = setInterval(() => void this.run(), hours * 60 * 60 * 1000);
    setTimeout(() => void this.run(), 15000);
    this.logger.log(`Product Hunter scheduler enabled: every ${hours}h`);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  status() {
    return { enabled: true, intervalHours: Math.max(1, Number(process.env.HUNTER_INTERVAL_HOURS || 6)), running: this.running, lastRunAt: this.lastRunAt, lastResult: this.lastResult, financialAction: 'NONE' };
  }

  async run() {
    if (this.running) return { ok: false, reason: 'RUN_ALREADY_IN_PROGRESS' };
    this.running = true;
    try {
      const configured = String(process.env.HUNTER_QUERIES || '').split(',').map(q => q.trim()).filter(Boolean);
      const queries = configured.length ? configured.slice(0, 12) : ['celular','notebook','fone bluetooth','smartwatch','eletrodoméstico','casa inteligente','beleza','fitness','acessórios','cozinha'];
      const results = [];
      for (const query of queries) {
        try {
          const result = await this.hunter.searchForConnectedUser(query);
          results.push({ query, total: result.total || 0, ok: true });
        } catch (error) {
          this.logger.warn(`Hunter failed for ${query}: ${String(error)}`);
          results.push({ query, ok: false, reason: String(error).includes('NOT_CONNECTED') ? 'MERCADO_LIVRE_NOT_CONNECTED' : 'SEARCH_FAILED' });
        }
      }
      this.lastRunAt = new Date();
      this.lastResult = { ok: true, queries: results, financialAction: 'NONE' };
      return this.lastResult;
    } finally { this.running = false; }
  }
}
