export type StrategyProduct = {
  title?: string | null;
  price?: number | string | null;
  originalPrice?: number | string | null;
  discountPercent?: number | string | null;
  soldQuantity?: number | string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  rating?: number | string | null;
  reviewsCount?: number | string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  affiliateUrl?: string | null;
};

const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as any)[c]);

export function productCategory(p: StrategyProduct) {
  const t = `${p.categoryName || ''} ${p.title || ''}`.toLowerCase();
  if (/carro|automot|veículo|freio|pastilha|suspens|amortec|embreag|motor|transmiss|injeção|ignição|bateria autom|filtro autom|farol|lanterna|retrovisor|pneu|roda|engate|reboque|som autom/.test(t)) return 'Automotivo';
  if (/saúde|saude|bem[- ]estar|massagem|postura|sono|termômetro|pressão|oxímetro|ortopéd|fisioterapia/.test(t)) return 'Saúde e Bem-estar';
  if (/aliment|cozinha|panela|air fryer|cafeteira|liquidificador|garrafa|utensílio|organizador|receita/.test(t)) return 'Casa e Alimentação';
  if (/casa|decoração|móveis|organizador|limpeza|jardim/.test(t)) return 'Casa e Alimentação';
  if (/beleza|maquiagem|perfume|cabelo|skin|creme|cosmético/.test(t)) return 'Beleza e Cuidados';
  if (/fitness|academia|corrida|treino|yoga|bicicleta/.test(t)) return 'Fitness e Bem-estar';
  return p.categoryName || 'Ofertas';
}

function money(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function discount(p: StrategyProduct) {
  const d = Number(p.discountPercent);
  if (Number.isFinite(d) && d > 0) return Math.round(d);
  const price = money(p.price), original = money(p.originalPrice);
  return price && original && original > price ? Math.round(((original - price) / original) * 100) : 0;
}

function benefitLines(p: StrategyProduct, category: string) {
  const lines: string[] = [];
  if (p.soldQuantity != null && Number.isFinite(Number(p.soldQuantity))) lines.push('Produto priorizado com base em sinal real de vendas disponível no Mercado Livre.');
  if (p.rating != null && Number(p.rating) > 0) lines.push(`Avaliação média informada: ${Number(p.rating).toFixed(1)}/5${p.reviewsCount ? ` em ${Number(p.reviewsCount).toLocaleString('pt-BR')} avaliações` : ''}.`);
  if (discount(p) > 0) lines.push(`Oferta com redução de aproximadamente ${discount(p)}% sobre o preço original informado.`);
  lines.push(`Selecionado para a categoria ${category} e preparado para divulgação com foco em descoberta orgânica.`);
  return lines;
}

export function buildEcommerceStrategy(p: StrategyProduct) {
  const name = String(p.title || 'Produto selecionado').trim();
  const category = productCategory(p);
  const price = money(p.price);
  const d = discount(p);
  const title = name.length > 70 ? name.slice(0, 67).replace(/\s+$/, '') + '...' : name;
  const metaTitle = `${title} | Oferta ${category}`.slice(0, 60);
  const tags = [...new Set([
    category.toLowerCase(),
    'ofertas',
    'mercado livre',
    ...name.toLowerCase().split(/\s+/).filter(x => x.length >= 4).slice(0, 6),
  ])].slice(0, 10);
  const benefits = benefitLines(p, category);
  const priceHtml = price ? `<p><strong>Preço informado: R$ ${price.toFixed(2).replace('.', ',')}</strong>${d ? ` · ${d}% de desconto` : ''}</p>` : '<p><strong>Preço: consultar no Mercado Livre.</strong></p>';
  const body_html = `<section><h2>${esc(name)}</h2><p>Descubra este produto selecionado pelo Orus para a categoria ${esc(category)}.</p>${priceHtml}<h3>Por que considerar</h3><ul>${benefits.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p>Consulte preço, disponibilidade, condições e especificações atualizadas diretamente no Mercado Livre.</p></section>`;
  const instagram = `🔥 ${name}\n\n${benefits.slice(0, 3).map(x => '• ' + x).join('\n')}\n\nQuer o link com desconto? Comente “EU QUERO” e receba no direct.\n\n#${tags.slice(0, 5).map(x => x.replace(/[^a-z0-9áéíóúãõç]/gi,'')).join(' #')}`;
  const pinterestTitle = `${name} | ${category} | Oferta e ideias`.slice(0, 100);
  const pinterestDescription = `Descubra ${name}, selecionado pelo Orus para ${category.toLowerCase()}. Veja informações, benefícios, preço quando disponível e acesso à oferta oficial. Pesquise, compare e confira a disponibilidade atual no Mercado Livre.`.slice(0, 500);
  const searchTerms = [
    name,
    `${category} ofertas`,
    `${category} melhores produtos`,
    `${name} promoção`,
    `${category} ideias e compras`,
  ].map(x => x.slice(0, 100));
  const tiktokScript = `GANCHO: “Se você procura ${name}, olha esta opção.”\nCENA 1: Mostre o produto e o contexto de uso.\nCENA 2: Destaque apenas benefícios e especificações confirmados na ficha do produto.\nCENA 3: Mostre preço/desconto somente se estiver atualizado.\nCTA: “Comente EU QUERO para receber o link com desconto.”\nOBS: Não inventar características, preço, estoque ou resultados.`;
  const imagePrompt = `Publicidade e-commerce aesthetic, formato vertical 9:16, produto “${name}” como protagonista, colocado sobre superfície de pedra natural, iluminação suave de fim de tarde, composição limpa, luxo discreto, fotografia comercial realista, alta definição, profundidade de campo elegante, sem texto, sem logotipos adicionados, sem pessoas.`;
  return {
    title,
    body_html,
    price,
    tags,
    meta_title: metaTitle,
    instagram: { caption: instagram, cta: 'Comente EU QUERO para receber o link com desconto no direct.', hashtags: tags.slice(0, 8) },
    pinterest: { title: pinterestTitle, description: pinterestDescription, search_terms: searchTerms },
    tiktok: { script: tiktokScript },
    creative: { image_prompt: imagePrompt, aspect_ratio: '9:16', no_text: true },
    strategy: { category, sales_signal: p.soldQuantity != null ? 'AVAILABLE' : 'NOT_AVAILABLE', affiliate_required: true, link_policy: 'PRESERVE_EXACT_MELI_LA_LINK' },
  };
}
