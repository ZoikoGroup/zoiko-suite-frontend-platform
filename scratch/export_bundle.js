const fs = require('fs');
const path = require('path');

/**
 * Zoiko Suite Platform - Frontend & Backend Export Script
 * Bundles all core frontend app routes, components, libraries,
 * and backend mock microservices into a clean export folder.
 */
function exportPlatform() {
  const rootDir = path.resolve(__dirname, '..');
  const targetDir = path.join(rootDir, 'exports', 'zoiko-suite-platform-bundle');

  const includeDirs = [
    'app',
    'components',
    'lib',
    'public',
    'scratch',
    'types',
  ];

  const includeFiles = [
    'package.json',
    'tsconfig.json',
    'next.config.ts',
    'eslint.config.mjs',
    'postcss.config.mjs',
    'AGENTS.md',
    'README.md',
  ];

  console.log(`📦 Exporting frontend & backend platform files to:`);
  console.log(`   ${targetDir}\n`);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let copiedFiles = 0;

  function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      for (const child of fs.readdirSync(src)) {
        if (child === 'node_modules' || child === '.next' || child === '.git') continue;
        copyRecursive(path.join(src, child), path.join(dest, child));
      }
    } else {
      fs.copyFileSync(src, dest);
      copiedFiles++;
    }
  }

  // Copy included directories
  for (const d of includeDirs) {
    const srcPath = path.join(rootDir, d);
    const destPath = path.join(targetDir, d);
    if (fs.existsSync(srcPath)) {
      copyRecursive(srcPath, destPath);
      console.log(`✅ Copied directory: ${d}/`);
    }
  }

  // Copy included root files
  for (const f of includeFiles) {
    const srcPath = path.join(rootDir, f);
    const destPath = path.join(targetDir, f);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      copiedFiles++;
      console.log(`✅ Copied file: ${f}`);
    }
  }

  // Generate manifest
  const manifest = {
    exportedAt: new Date().toISOString(),
    totalFiles: copiedFiles,
    source: 'zoiko-suite-frontend-platform',
    components: {
      frontend: 'Next.js 16 App Router (22 Admin Domains)',
      backend_microservices: '7 Tax Governance Microservices in scratch/tax_services_runner.js',
      api_gateway: 'BFF Gateway routes in app/api/v1',
    },
    exportPath: targetDir,
  };

  fs.writeFileSync(path.join(targetDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n🎉 Export complete! Total ${copiedFiles} files packaged.`);
  console.log(`📁 Bundle location: ${targetDir}`);
}

exportPlatform();
