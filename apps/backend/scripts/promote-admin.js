#!/usr/bin/env node

require('dotenv').config();
const postgres = require('postgres');

const email = process.argv[2];
const DEFAULT_ADMIN_PERMISSIONS = [
  'prizes.manage',
  'finance.manage',
  'security.manage',
  'config.manage',
];

if (!email) {
  console.error('Usage: node scripts/promote-admin.js <user_email>');
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
    SELECT id, email, role
    FROM users
    WHERE email = ${lowerEmail}
    LIMIT 1
  `;

  if (users.length === 0) {
    console.error(`No user found for email: ${lowerEmail}`);
    await sql.end();
    process.exit(1);
  }

  const user = users[0];

  const admins = await sql`
    SELECT id
    FROM admins
    WHERE user_id = ${user.id}
    LIMIT 1
  `;

  if (user.role !== 'admin') {
    await sql`
      UPDATE users
      SET role = 'admin', updated_at = NOW()
      WHERE id = ${user.id}
    `;
  }

  if (admins.length === 0) {
    await sql`
      INSERT INTO admins (user_id, display_name, is_active, created_at, updated_at)
      VALUES (${user.id}, ${user.email}, true, NOW(), NOW())
    `;
  }

  const [admin] = await sql`
    SELECT id
    FROM admins
    WHERE user_id = ${user.id}
    LIMIT 1
  `;

  for (const permissionKey of DEFAULT_ADMIN_PERMISSIONS) {
    await sql`
      INSERT INTO admin_permissions (admin_id, permission_key, created_at)
      VALUES (${admin.id}, ${permissionKey}, NOW())
      ON CONFLICT (admin_id, permission_key) DO NOTHING
    `;
  }

  console.log(`Promoted to admin: ${user.email} (id=${user.id})`);
  await sql.end();
})().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
