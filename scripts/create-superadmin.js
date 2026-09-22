const bcrypt = require('bcryptjs');

async function createSuperAdmin() {
  const password = 'admin123';
  const email = 'super@admin.com';
  
  // Generate hash
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  
  console.log('\n✅ Super Admin Credentials Generated\n');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('Password Hash:', hash);
  
  console.log('\n📋 Run this SQL in your Supabase SQL Editor:\n');
  console.log(`
-- Create Super Admin User
INSERT INTO users (full_name, email, phone_number, password_hash, role, is_active)
VALUES (
  'Super Administrator',
  '${email}',
  '9999999999',
  '${hash}',
  'super_admin',
  true
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  is_active = true;
  `);
}

createSuperAdmin().catch(console.error);
