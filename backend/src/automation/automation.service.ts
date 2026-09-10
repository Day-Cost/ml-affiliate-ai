import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ProductHunterService } from '../products/product-hunter.service';

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private enabled = false;
  private lastRunAt: Date | null = null;
  private lastResult: any = null;

  constructor(private hunter: ProductHunterService) {}

  private hours() { return Math.max(1, Number(process.env.HUNTER_INTERVAL_HOURS || 6)); }
  private schedule() { if (this.timer) clearInterval(this.timer); this.timer = setInterval(() => void this.run(), this.hours() * 60 * 60 * 1000); }

  onModuleInit() { this.logger.log('Automation loaded OFF. Operator must press START.'); }
  onModuleDestroy() { this.stop(); }

  start() {
    if (this.enabled) return { ok: true, enabled: true, alreadyStarted: true };
    this.enabled = true;
    this.schedule();
    this.logger.log('Product Hunter automation STARTED by operator.');
    void this.run();
    return { ok: true, enabled: true, started: true };
  }

  stop() {
    this.enabled = false;
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    this.logger.warn('Product Hunter automation STOPPED by operator.');
    return { ok: true, enabled: false, stopped: true, running: this.running };
  }

  status() { return { enabled: this.enabled, intervalHours: this.hours(), running: this.running, lastRunAt: this.lastRunAt, lastResult: this.lastResult, financialAction: 'NONE' }; }

  async run() {
    if (!this.enabled) return { ok: false, reason: 'AUTOMATION_STOPPED' };
    if (this.running) return { ok: false, reason: 'RUN_ALREADY_IN_PROGRESS' };
    this.running = true;
    try {
      const configured = String(process.env.HUNTER_QUERIES || '').split(',').map(q => q.trim()).filter(Boolean);
      const queries = configured.length ? configured.slice(0, 12) : ['celular','notebook','fone bluetooth','smartwatch','eletrodoméstico','casa inteligente','beleza','fitness','acessórios','cozinha'];
      const results = [];
      for (const query of queries) {
        if (!this.enabled) break;
        try { const result = await this.hunter.searchForConnectedUser(query); results.push({ query, total: result.total || 0, ok: true }); }
        catch (error) { this.logger.warn(`Hunter failed for ${query}: ${String(error)}`); results.push({ query, ok: false, reason: String(error).includes('NOT_CONNECTED') ? 'MERCADO_LIVRE_NOT_CONNECTED' : 'SEARCH_FAILED' }); }
      }
      this.lastRunAt = new Date();
      this.lastResult = { ok: true, queries: results, financialAction: 'NONE', stoppedDuringRun: !this.enabled };
      return this.lastResult;
    } finally { this.running = false; }
  }
}
