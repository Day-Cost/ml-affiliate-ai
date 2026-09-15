const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'marketplace', 'mercadolivre.service.ts');
let text = fs.readFileSync(file, 'utf8');

const oldBlock = `        const itemId = String(catalogDetail?.buy_box_winner?.item_id || candidate?.buy_box_winner?.item_id || '').trim().toUpperCase();
        if (!/^MLB\\d{9,}$/.test(itemId)) continue;

        let item: any;`;

const newBlock = `        // A catalog search can return a parent product without a buy_box_winner.
        // Mercado Livre documents that parents expose children_ids and the terminal
        // child can carry the winning marketplace publication. Walk those official
        // catalog children before discarding the result. Never invent an item ID or URL.
        const candidateCatalogIds = [];
        const directItemId = String(catalogDetail?.buy_box_winner?.item_id || candidate?.buy_box_winner?.item_id || '').trim().toUpperCase();
        if (directItemId) candidateCatalogIds.push({ productId: catalogId, itemId: directItemId });

        const children = Array.isArray(catalogDetail?.children_ids) ? catalogDetail.children_ids : [];
        for (const childId of children.slice(0, 12)) {
          try {
            const child = await this.getCatalogProduct(userId, String(childId));
            const childItemId = String(child?.buy_box_winner?.item_id || '').trim().toUpperCase();
            if (/^MLB\\d{9,}$/.test(childItemId)) {
              candidateCatalogIds.push({ productId: String(child?.id || childId), itemId: childItemId, catalog: child });
            }
          } catch (error: any) {
            console.warn(\`[MercadoLivre] catalog child unavailable parent=\${catalogId} child=\${childId} status=\${error?.response?.status || 'unknown'}\`);
          }
        }

        let itemId = null;
        let winningCatalog = catalogDetail;
        for (const candidateItem of candidateCatalogIds) {
          if (/^MLB\\d{9,}$/.test(String(candidateItem.itemId || ''))) {
            itemId = String(candidateItem.itemId).toUpperCase();
            winningCatalog = candidateItem.catalog || catalogDetail;
            break;
          }
        }
        if (!itemId) continue;

        let item: any;`;

if (!text.includes(oldBlock)) {
  throw new Error('CATALOG_REAL_LISTING_BLOCK_NOT_FOUND');
}

text = text.replace(oldBlock, newBlock);
text = text.replace(
  'price: item.price ?? catalogDetail?.buy_box_winner?.price ?? null,',
  'price: item.price ?? winningCatalog?.buy_box_winner?.price ?? catalogDetail?.buy_box_winner?.price ?? null,'
);
text = text.replace(
  'currency_id: item.currency_id || catalogDetail?.buy_box_winner?.currency_id || \'BRL\',',
  'currency_id: item.currency_id || winningCatalog?.buy_box_winner?.currency_id || catalogDetail?.buy_box_winner?.currency_id || \'BRL\','
);
text = text.replace(
  'sold_quantity: item.sold_quantity ?? catalogDetail?.buy_box_winner?.sold_quantity ?? null,',
  'sold_quantity: item.sold_quantity ?? winningCatalog?.buy_box_winner?.sold_quantity ?? catalogDetail?.buy_box_winner?.sold_quantity ?? null,'
);
text = text.replace(
  'category_id: item.category_id || catalogDetail?.buy_box_winner?.category_id || null,',
  'category_id: item.category_id || winningCatalog?.buy_box_winner?.category_id || catalogDetail?.buy_box_winner?.category_id || null,'
);
text = text.replace(
  'seller_id: item.seller_id || catalogDetail?.buy_box_winner?.seller_id || null,',
  'seller_id: item.seller_id || winningCatalog?.buy_box_winner?.seller_id || catalogDetail?.buy_box_winner?.seller_id || null,'
);

fs.writeFileSync(file, text);
console.log('Catalog real-listing repair applied: parent products now resolve through official children_ids and buy_box_winner.');
