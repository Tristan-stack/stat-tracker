#!/usr/bin/env node
/**
 * Connexion MTProto one-shot : produit TELEGRAM_SESSION_STRING pour .env
 * Prérequis : TELEGRAM_API_ID, TELEGRAM_API_HASH (my.telegram.org)
 */
import 'dotenv/config';
import input from 'input';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/StringSession.js';

const rawId = String(process.env.TELEGRAM_API_ID ?? '').replace(/\s+/g, '');
const apiId = Number(rawId);
const apiHash = String(process.env.TELEGRAM_API_HASH ?? '').trim();

if (!Number.isFinite(apiId) || apiId <= 0 || !apiHash) {
  console.error('Définis TELEGRAM_API_ID (nombre) et TELEGRAM_API_HASH dans .env');
  process.exit(1);
}

const stringSession = new StringSession('');
const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
  deviceModel: 'StatTrackerLogin',
  appVersion: '1.0',
});

await client.start({
  phoneNumber: async () => String(await input.text('Numéro international (+336...) : ')).trim(),
  phoneCode: async () => String(await input.text('Code SMS : ')).trim(),
  password: async () => String(await input.text('Mot de passe 2FA (Entrée si aucun) : ')).trim(),
  onError: (err) => console.warn(err instanceof Error ? err.message : String(err)),
});

const saved = stringSession.save();
if (!saved) {
  console.error('Impossible de sauver la session (auth incomplète).');
  process.exit(2);
}

console.info('');
console.info('Ajoute cette ligne dans .env (sans guillemets parasites) :');
console.info('');
console.info(`TELEGRAM_SESSION_STRING=${saved}`);
console.info('');
console.info(`Longueur : ${saved.length} car.`);

await client.disconnect();
process.exit(0);
