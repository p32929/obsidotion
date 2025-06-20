const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Configuration
const config = {
  // Vault path must be set via environment variable
  vaultPath: process.env.OBSIDIAN_VAULT_PATH,
  pluginId: process.env.PLUGIN_ID || 'obsidotion',
  
  // Files to copy to the vault
  filesToCopy: [
    'main.js',
    'manifest.json',
    'styles.css'
  ]
};

function deployToVault() {
  if (!config.vaultPath) {
    console.log('⚠️  OBSIDIAN_VAULT_PATH not set - skipping deployment');
    console.log('💡 To enable auto-deployment, create a .env file with OBSIDIAN_VAULT_PATH');
    return;
  }
  
  const targetDir = path.join(config.vaultPath, config.pluginId);
  
  console.log(`📦 Deploying to: ${targetDir}`);
  
  // Create plugin directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`✅ Created plugin directory: ${targetDir}`);
  }
  
  // Copy files
  config.filesToCopy.forEach(file => {
    const sourcePath = path.resolve(file);
    const targetPath = path.join(targetDir, file);
    
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✅ Copied: ${file}`);
    } else {
      console.log(`⚠️  File not found: ${file}`);
    }
  });
  
  console.log(`🚀 Deployment complete! Plugin available at: ${targetDir}`);
  console.log(`💡 Reload Obsidian or restart the plugin to see changes.`);
}

function watchAndDeploy() {
  console.log('👀 Watching for changes...');
  
  config.filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
      fs.watchFile(file, (curr, prev) => {
        console.log(`📝 ${file} changed, deploying...`);
        deployToVault();
      });
    }
  });
}

module.exports = {
  config,
  deployToVault,
  watchAndDeploy
};

// If run directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'watch') {
    deployToVault();
    watchAndDeploy();
  } else {
    deployToVault();
  }
} 