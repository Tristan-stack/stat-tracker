#!/usr/bin/env node
/**
 * Utilitaire CLI : probe d'une transaction Solana pour valider la règle 7Srsw.
 *
 * Usage : node scripts/probe-7srsw.mjs <signature>
 *
 * Sortie : liste les instructions (top-level + inner) NON parsées avec leur
 * `accounts[]`. Met en évidence celles dont `accounts[2] === 7Srsw` et affiche
 * le candidat `accounts[1]` comme vrai destinataire.
 *
 * Lit `HELIUS_API_KEY` depuis l'environnement (charge `.env` si présent).
 */

import 'dotenv/config';

const SEVEN_SRSW = '7SrswG4bFtgSoPJCfJs2WFKbuDevid396HjeA4YN8XFB';

function fail(msg) {
  console.error(`\u2717 ${msg}`);
  process.exit(1);
}

const signature = process.argv[2];
if (!signature) fail('Usage : node scripts/probe-7srsw.mjs <signature>');

const apiKey = process.env.HELIUS_API_KEY;
if (!apiKey) fail('HELIUS_API_KEY manquant dans l\'environnement.');

const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getTransaction',
    params: [signature, { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }],
  }),
});

if (!res.ok) fail(`HTTP ${res.status} ${await res.text()}`);

const json = await res.json();
if (json.error) fail(`RPC error : ${json.error.message}`);
if (!json.result) fail('Transaction introuvable.');

const tx = json.result;
const top = tx.transaction?.message?.instructions ?? [];
const inner = (tx.meta?.innerInstructions ?? []).flatMap((g) => g.instructions ?? []);
const all = [...top.map((ix, i) => ({ ix, where: `top[${i}]` })), ...inner.map((ix, i) => ({ ix, where: `inner[${i}]` }))];

console.log(`Signature : ${signature}`);
console.log(`Instructions totales : ${all.length} (top: ${top.length}, inner: ${inner.length})`);
console.log('—');

let trapsFound = 0;
for (const { ix, where } of all) {
  if (ix.parsed !== undefined) continue;
  const accounts = Array.isArray(ix.accounts) ? ix.accounts : [];
  const isTrap = accounts[2] === SEVEN_SRSW;
  if (isTrap) trapsFound += 1;

  console.log(`${isTrap ? '\u2192 PIEGE 7Srsw' : '   '} ${where} programId=${ix.programId}`);
  for (let i = 0; i < accounts.length; i += 1) {
    const marker = isTrap && i === 1 ? '  \u2190 VRAI DESTINATAIRE (accounts[1])' : isTrap && i === 2 ? '  \u2190 leurre 7Srsw' : '';
    console.log(`     #${i + 1} accounts[${i}] = ${accounts[i]}${marker}`);
  }
}

console.log('—');
if (trapsFound === 0) {
  console.log('Aucune instruction piège 7Srsw détectée dans cette transaction.');
} else {
  console.log(`${trapsFound} instruction(s) piège 7Srsw détectée(s).`);
}
