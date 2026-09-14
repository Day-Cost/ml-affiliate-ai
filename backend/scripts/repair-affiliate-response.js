const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'product-hunter.service.ts');
let text = fs.readFileSync(file, 'utf8');

const oldLine = "    return { ...updated, affiliateStatus: 'ACTIVE', marketing: 'QUEUED', storefront: 'ACTIVE' };";
const newLines = "    // Prisma returns sellerId as BigInt. Express cannot JSON-serialize BigInt, so normalize it before replying.\n    const safeUpdated = { ...updated, sellerId: updated.sellerId == null ? null : String(updated.sellerId) };\n    return { ...safeUpdated, affiliateStatus: 'ACTIVE', marketing: 'QUEUED', storefront: 'ACTIVE' };";

if (text.includes(newLines)) {
  console.log('Affiliate response serialization repair already applied');
} else if (text.includes(oldLine)) {
  text = text.replace(oldLine, newLines);
  fs.writeFileSync(file, text);
  console.log('Affiliate response serialization repair applied');
} else {
  throw new Error('AFFILIATE_RESPONSE_RETURN_MARKER_NOT_FOUND');
}
