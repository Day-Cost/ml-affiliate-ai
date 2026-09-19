const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'marketplace', 'mercadolivre.service.ts');
let text = fs.readFileSync(file, 'utf8');

const startMarker = "        const itemId = String(catalogDetail?.buy_box_winner?.item_id || candidate?.buy_box_winner?.item_id || '').trim().toUpperCase();";
const endMarker = '        let item: any;';
const start = text.indexOf(startMarker);
const end = text.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('CATALOG_REAL_LISTING_BLOCK_NOT_FOUND');

const replacement = `        // A catalog result is not itself a marketplace listing. Resolve a real
        // MLB item only from an official Mercado Livre publication reference.
        const candidateItemIds = [];
        const directItemId = String(catalogDetail?.buy_box_winner?.item_id || candidate?.buy_box_winner?.item_id || '').trim().toUpperCase();
        if (/^MLB\\d{9,}$/.test(directItemId)) candidateItemIds.push(directItemId);

        // Mercado Livre can expose competing publications through the catalog
        // product's /items resource even when buy_box_winner is null.
        try {
          const listingData = await this.getCatalogProductItems(userId, catalogId);
          const listingIds = Array.isArray(listingData?.results) ? listingData.results : [];
          for (const listing of listingIds.slice(0, 20)) {
            const listingId = String(listing?.item_id || listing?.id || '').trim().toUpperCase();
            if (/^MLB\\d{9,}$/.test(listingId)) candidateItemIds.push(listingId);
          }
          if (listingIds.length) {
            console.log(\`[MercadoLivre] catalog publications query id=\${catalogId} results=\${listingIds.length}\`);
          }
        } catch (error: any) {
          console.warn(\`[MercadoLivre] catalog publications unavailable id=\${catalogId} status=\${error?.response?.status || 'unknown'}\`);
        }

        // Parent catalog products expose official children_ids. Terminal children
        // may have their own buy_box_winner.
        const children = Array.isArray(catalogDetail?.children_ids) ? catalogDetail.children_ids : [];
        for (const childId of children.slice(0, 12)) {
          try {
            const child = await this.getCatalogProduct(userId, String(childId));
            const childItemId = String(child?.buy_box_winner?.item_id || '').trim().toUpperCase();
            if (/^MLB\\d{9,}$/.test(childItemId)) candidateItemIds.push(childItemId);
          } catch (error) {
            console.warn(\`[MercadoLivre] catalog child unavailable parent=\${catalogId} child=\${childId} status=\${error?.response?.status || 'unknown'}\`);
          }
        }

        const itemId = candidateItemIds.find(id => /^MLB\\d{9,}$/.test(id));
        if (!itemId) continue;

`;
text = text.slice(0, start) + replacement + text.slice(end);
fs.writeFileSync(file, text);
console.log('Catalog real-listing repair applied: official publication results + children_ids + buy_box_winner are resolved before accepting a listing.');
