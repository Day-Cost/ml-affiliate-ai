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
    if (configured.length) return [...new Set(configured)];

    // Automatic discovery families. The user does not need to type searches:
    // every family is paginated by ProductHunter until the available results
    // are consumed (or the configured safety cap is reached).
    return [
      'celular', 'smartphone', 'iphone', 'samsung galaxy', 'notebook', 'tablet',
      'fone bluetooth', 'headset', 'smartwatch', 'televisão', 'monitor',
      'câmera', 'acessórios para celular', 'carregador', 'power bank',
      'air fryer', 'cafeteira', 'liquidificador', 'eletrodomésticos',
      'cozinha', 'organização da casa', 'casa inteligente', 'ferramentas',
      'beleza', 'cuidados pessoais', 'fitness', 'academia', 'saúde e bem estar',
      'moda feminina', 'moda masculina', 'calçados', 'bolsas e acessórios',
      'bebê e infantil', 'pet shop', 'jardinagem', 'games', 'videogame',
      'informática', 'automotivo', 'peças automotivas', 'acessórios automotivos',
      'ferramentas automotivas', 'rodas e pneus', 'som automotivo',
      'casa e decoração', 'móveis', 'material escolar', 'papelaria',
      'alimentação e utensílios', 'ofertas', 'mais vendidos',
    ];
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    let hadFailure = false;
    try {
      const ready = await this.hunter.isReadyForAutomation();
      if (!ready.ready) {
        this.logger.log(`Automatic Product Hunter aguardando Mercado Livre conectado: ${ready.reason}`);
        hadFailure = true;
        return;
      }

      const queries = this.queries();
      let total = 0;
      const maxResults = Math.max(20, Math.min(10000, Number(process.env.MLAI_HUNTER_MAX_RESULTS_PER_QUERY || 1000)));
      for (const query of queries) {
        try {
          const result = await this.hunter.searchAllForConnectedUser(query, maxResults);
          total += Number(result?.total || 0);
          this.logger.log(`Automatic Product Hunter query="${query}" realListings=${result?.total || 0} pages=${result?.pages || 0} sourceTotal=${result?.sourceTotal || 0} truncated=${Boolean(result?.truncated)}`);
        } catch (error: any) {
          hadFailure = true;
          const message = String(error?.message || 'unknown error');
          this.logger.warn(`Automatic Product Hunter query="${query}" failed: ${message}`);
          // A policy 403 is an external Mercado Livre permission/policy block.
          // Stop this run immediately instead of hammering the API with every
          // configured family. A later scheduled retry will resume after the
          // external permission is fixed.
          if (message === 'MERCADO_LIVRE_LISTING_SEARCH_FORBIDDEN_POLICY') {
            this.logger.error('Automatic Product Hunter paused: Mercado Livre listing-search policy 403 requires external authorization/permission action.');
            break;
          }
        }
      }
      this.logger.log(`Automatic Product Hunter finished queries=${queries.length} realListings=${total} hadFailure=${hadFailure}`);
    } finally {
      this.running = false;
      // Keep the worker alive: healthy runs stay quiet for 6h; a failed run
      // retries in 15m so a repaired OAuth/policy permission is picked up
      // without requiring a restart or hammering the Mercado Livre API.
      const nextRunMs = hadFailure ? 15 * 60 * 1000 : 6 * 60 * 60 * 1000;
      this.timer = setTimeout(() => this.run(), nextRunMs);
      this.timer.unref?.();
    }
  }
}
