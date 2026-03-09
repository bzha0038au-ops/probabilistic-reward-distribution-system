#!/usr/bin/env node

require('dotenv').config();
const postgres = require('postgres');
const { genSaltSync, hashSync } = require('bcrypt-ts');

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node scripts/reset-password.js <user_email> <new_password>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('DATABASE_URL or POSTGRES_URL is required.');
  process.exit(1);
}

const sql = postgres(connectionString, {
  ssl: process.env.POSTGRES_SSL === 'true' ? 'require' : undefined,
});

(async () => {
  const lowerEmail = email.toLowerCase();

  const users = await sql`
    SELECT id, email
    FROM users
    WHERE email = ${lowerEmail}
    LIMIT 1
  `;

  if (users.length === 0) {
    console.error(`No user found for email: ${lowerEmail}`);
    await sql.end();
    process.exit(1);
  }

  const salt = genSaltSync(10);
  const passwordHash = hashSync(newPassword, salt);

  await sql`
    UPDATE users
    SET password_hash = ${passwordHash}, updated_at = NOW()
    WHERE id = ${users[0].id}
  `;

  console.log(`Password reset for ${users[0].email} (id=${users[0].id})`);
  await sql.end();
})().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
