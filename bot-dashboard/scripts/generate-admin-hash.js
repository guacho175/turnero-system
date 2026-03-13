// Uso: node scripts/generate-admin-hash.js tuPasswordAqui

import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("Uso: node scripts/generate-admin-hash.js <tu_password>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
console.log("\n Hash generado:");
console.log(hash);
console.log("\n Agregá esto a tu .env.local:");
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);