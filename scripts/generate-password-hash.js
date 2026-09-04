/**
 * Password Hash Generator
 * 
 * This script generates bcrypt password hashes for use in SQL inserts
 * 
 * Usage:
 * node scripts/generate-password-hash.js yourpassword
 * 
 * Or run interactively:
 * node scripts/generate-password-hash.js
 */

const bcrypt = require('bcryptjs');
const readline = require('readline');

async function generateHash(password) {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  return hash;
}

async function main() {
  // Check if password provided as argument
  const password = process.argv[2];

  if (password) {
    // Generate hash from command line argument
    console.log('\n🔐 Generating bcrypt hash...\n');
    const hash = await generateHash(password);
    console.log('Password:', password);
    console.log('Bcrypt Hash:', hash);
    console.log('\n✅ Copy the hash above and use it in your SQL INSERT statement');
    console.log('Example:');
    console.log(`INSERT INTO users (email, password_hash, full_name, role, department) VALUES (
  'admin@example.com',
  '${hash}',
  'Admin Name',
  'admin',
  'electric'
);\n`);
  } else {
    // Interactive mode
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n🔐 Bcrypt Password Hash Generator\n');
    console.log('Generate secure password hashes for your database\n');

    rl.question('Enter password to hash: ', async (password) => {
      if (!password) {
        console.log('❌ Password cannot be empty');
        rl.close();
        return;
      }

      console.log('\nGenerating hash...');
      const hash = await generateHash(password);
      
      console.log('\n✅ Hash generated successfully!\n');
      console.log('Password:', password);
      console.log('Bcrypt Hash:', hash);
      console.log('\nSQL Example:');
      console.log(`INSERT INTO users (email, password_hash, full_name, role, department) VALUES (
  'admin@example.com',
  '${hash}',
  'Admin Name',
  'admin',
  'electric'
);\n`);

      rl.close();
    });
  }
}

main().catch(console.error);
