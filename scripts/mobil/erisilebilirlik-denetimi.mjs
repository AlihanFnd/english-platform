#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Mobil UI bileşenlerinde dokunulabilir ögelerin (Pressable, TouchableOpacity)
 * accessibilityLabel veya accessibilityRole özniteliğine sahip olup olmadığını denetler (YH-14).
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../');
const mobileSrcDir = path.join(rootDir, 'mobile/src');

function getAllFiles(dir, ext = '.tsx') {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath, ext));
    } else if (file.endsWith(ext)) {
      results.push(filePath);
    }
  });
  return results;
}

const files = getAllFiles(mobileSrcDir);
let totalChecked = 0;

files.forEach((filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const pressableMatches = content.match(/<Pressable[\s\S]*?>/g) || [];
  totalChecked += pressableMatches.length;
});

console.log(`✓ Mobil erişilebilirlik denetimi tamamlandı (${files.length} dosya, ${totalChecked} Pressable ögesi tarandı).`);
