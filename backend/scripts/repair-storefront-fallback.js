const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'marketplace', 'mercadolivre.service.ts');
let text = fs.readFileSync(file, 'utf8');
const marker = '      console.log(`[MercadoLivre] catalog discovery ok query="${query}" catalogResults=${catalogResults.length} realListings=${realResults.length}`);';
if (!text.includes(marker)) throw new Error('STOREFRONT_FALLBACK_MARKER_NOT_FOUND');
if (!text.includes(marker)) throw new Error('STOREFRONT_FALLBACK_MARKER_NOT_FOUND');

const replacement = [
  '      // Read-only fallback: query Mercado Livre public storefront and accept only URLs',
  '      // actually returned by the storefront HTML. Never construct a listing URL.',
  '      if (!realResults.length) {',
  '        try {',
  '          const storefrontQuery = encodeURIComponent(query.trim()).replace(/%20/g, "-");',
  '          const html = String((await axios.get("https://lista.mercadolivre.com.br/" + storefrontQuery, {',
  '            headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; ML-Affiliate-AI/1.0)" },',
  '            timeout: 15000, httpsAgent: this.agent(), proxy: false,',
  '          })).data || "");',
  '          const seen = new Set();',
  '          const links = [];',
  '          const rx = /(?:https?:\\/\\/)?(?:www\\.)?produto\\.mercadolivre\\.com\\.br\\/MLB-\\d+[^"\'\\s<>]*/gi;',
  '          for (const match of html.matchAll(rx)) {',
  '            let url = String(match[0]).replace(/&amp;/g, "&");',
  '            if (!/^https?:\\/\\//i.test(url)) url = "https://" + url;',
  '            url = url.split("#")[0];',
  '            if (!/^https:\\/\\/produto\\.mercadolivre\\.com\\.br\\/MLB-\\d+/i.test(url)) continue;',
  '            if (seen.has(url)) continue;',
  '            seen.add(url); links.push(url);',
  '            if (links.length >= 10) break;',
  '          }',
  '          for (const url of links) {',
  '            const idMatch = url.match(/\\/(MLB-\\d+)/i);',
  '            if (!idMatch) continue;',
  '            const id = idMatch[1].replace("-", "");',
  '            const slug = (url.split("/").pop() || "").split("?")[0];',
  '            const title = slug.replace(/^MLB-\\d+-/i, "").replace(/-_JM.*$/i, "").replace(/[-_]+/g, " ").trim() || "Produto Mercado Livre";',
  '            realResults.push({ id, title, price: null, currency_id: "BRL", permalink: url, thumbnail: null, catalog_product_id: null, sold_quantity: null, category_id: null, seller_id: null, item: null });',
  '          }',
  '          console.log("[MercadoLivre] storefront listing fallback query=" + query + " discovered=" + realResults.length);',
  '        } catch (error) {',
  '          console.warn("[MercadoLivre] storefront listing fallback failed query=" + query + " status=" + ((error && error.response && error.response.status) || "unknown"));',
  '        }',
  '      }',
  '      console.log("[MercadoLivre] catalog discovery ok query=\"" + query + "\" catalogResults=" + catalogResults.length + " realListings=" + realResults.length);',
].join("\n");
text = text.replace(marker, replacement);
fs.writeFileSync(file, text);
console.log('Storefront fallback repair applied.');
