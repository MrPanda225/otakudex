import { loadConfig } from '../config.ts';
import { openDatabase } from '../db/index.ts';
import { loadEnvFile } from '../load-env.ts';
import { createAdminService } from './admin.ts';

/**
 * `npm run admin:reset-link -- someone@example.com`
 * Prints a one-time link, valid 24 hours, that lets that account choose a new password. It works on the
 * machine that runs the server, which is the proof that the person asking owns it: this is how an
 * administrator who lost their password gets back in. With the embedded development database, stop the
 * server first (only one process can open it).
 */
loadEnvFile();
const config = loadConfig();
const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run admin:reset-link -- <e-mail du compte>');
  process.exit(2);
}

const db = await openDatabase(config.databaseUrl);
try {
  const link = await createAdminService({ db }).createResetLinkByEmail(email);
  console.log(`Lien de réinitialisation pour ${email} (valable jusqu'au ${new Date(link.expiresAt).toLocaleString('fr-FR')}) :`);
  console.log(`  http://localhost:${config.port}/#/reinitialisation/${link.token}`);
  console.log("Remplace l'adresse par celle de ton serveur si ce n'est pas localhost. Le lien ne sert qu'une fois.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db.close();
}
