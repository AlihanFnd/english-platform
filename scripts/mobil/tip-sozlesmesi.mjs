#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Web (frontend/app/api.ts) ile Mobil (mobile/src/lib/api.ts) arasındaki
 * ortak arayüzlerin (interface) alan adlarını karşılaştırır (YH-14 §7).
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../');
const webApiPath = path.join(rootDir, 'frontend/app/api.ts');
const mobileApiPath = path.join(rootDir, 'mobile/src/lib/api.ts');

if (!fs.existsSync(webApiPath) || !fs.existsSync(mobileApiPath)) {
  console.error('❌ api.ts dosyalarından biri bulunamadı.');
  process.exit(1);
}

function extractInterfaces(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const interfaceRegex = /export\s+interface\s+([A-Za-z0-9_]+)\s*\{([^}]+)\}/g;
  const interfaces = {};

  let match;
  while ((match = interfaceRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];

    const fields = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*'))
      .map((line) => {
        const fieldMatch = line.match(/^([A-Za-z0-9_]+)\??\s*:/);
        return fieldMatch ? fieldMatch[1] : null;
      })
      .filter(Boolean);

    interfaces[name] = fields.sort();
  }

  return interfaces;
}

const webInterfaces = extractInterfaces(webApiPath);
const mobileInterfaces = extractInterfaces(mobileApiPath);

const commonInterfaceNames = Object.keys(webInterfaces).filter((name) => mobileInterfaces[name]);

let hasMismatch = false;

for (const name of commonInterfaceNames) {
  const webFields = webInterfaces[name];
  const mobileFields = mobileInterfaces[name];

  const webStr = webFields.join(',');
  const mobileStr = mobileFields.join(',');

  if (webStr !== mobileStr) {
    console.error(`❌ [Tip Sözleşmesi] '${name}' arayüzünde alan ayrışması tespit edildi:`);
    console.error(`   Web   (${webFields.length} alan): ${webFields.join(', ')}`);
    console.error(`   Mobil (${mobileFields.length} alan): ${mobileFields.join(', ')}`);
    hasMismatch = true;
  }
}

if (hasMismatch) {
  console.error('\n❌ Tip sözleşmesi kapısı başarısız! Web ve mobil tipleri eşit olmalıdır.');
  process.exit(1);
}

console.log(`✓ Web ↔ Mobil tip sözleşmesi tam uyumlu (${commonInterfaceNames.length} arayüz doğrulandı).`);
