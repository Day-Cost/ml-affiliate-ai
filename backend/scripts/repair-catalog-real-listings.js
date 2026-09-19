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
        if (/^MLB\\d{9,}$/.test(directItemId)) candidateItemIds.push({ itemId: directItemId, listing: null });

        // Mercado Livre can expose competing publications through the catalog
        // product's /items resource even when buy_box_winner is null.
        try {
          const listingData = await this.getCatalogProductItems(userId, catalogId);
          const listingIds = Array.isArray(listingData?.results) ? listingData.results : [];
          for (const listing of listingIds.slice(0, 20)) {
            const listingId = String(listing?.item_id || listing?.id || '').trim().toUpperCase();
            if (/^MLB\\d{9,}$/.test(listingId)) candidateItemIds.push({ itemId: listingId, listing });
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
          } catch (error: any) {
            console.warn(\`[MercadoLivre] catalog child unavailable parent=\${catalogId} child=\${childId} status=\${error?.response?.status || 'unknown'}\`);
          }
        }

        const directPublication = candidateItemIds.find(x => /^https?:\\/\\/(?:www\\.|produto\\.)?mercadolivre\\.com\\.br\\//i.test(String(x?.listing?.permalink || '')));
        if (directPublication) {
          const listing = directPublication.listing;
          realResults.push({
            id: directPublication.itemId,
            title: listing?.title || catalogDetail?.name || candidate?.name || '',
            price: listing?.price ?? listing?.buy_box_winner?.price ?? catalogDetail?.buy_box_winner?.price ?? null,
            currency_id: listing?.currency_id || listing?.buy_box_winner?.currency_id || 'BRL',
            permalink: String(listing.permalink),
            thumbnail: listing?.thumbnail || listing?.secure_thumbnail || catalogDetail?.pictures?.[0]?.url || null,
            catalog_product_id: catalogId,
            sold_quantity: listing?.sold_quantity ?? listing?.buy_box_winner?.sold_quantity ?? null,
            category_id: listing?.category_id || listing?.buy_box_winner?.category_id || null,
            seller_id: listing?.seller_id || listing?.buy_box_winner?.seller_id || null,
            item: listing,
          });
          continue;
        }
        const itemId = candidateItemIds.length ? candidateItemIds[0].itemId : null;
        if (!itemId) continue;

`;
text = text.slice(0, start) + replacement + text.slice(end);
fs.writeFileSync(file, text);
console.log('Catalog real-listing repair applied: official publication results + children_ids + buy_box_winner are resolved before accepting a listing.');
