const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

async function build() {
  const configs = [
    // Extension Host
    {
      entryPoints: ['src/extension.ts'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: 'dist/extension.js',
      external: ['vscode'],
      sourcemap: true,
    },
    // Webview Bundle
    {
      entryPoints: ['src/webview/main.ts'],
      bundle: true,
      platform: 'browser',
      target: 'es2020',
      outfile: 'dist/media/webview.js',
      sourcemap: true,
    },
    // Test: engine.test.ts
    {
      entryPoints: ['test/engine.test.ts'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: 'dist/test/engine.test.js',
      sourcemap: true,
    },
    // Test: team.test.ts
    {
      entryPoints: ['test/team.test.ts'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: 'dist/test/team.test.js',
      sourcemap: true,
    },
    // Test: room.test.ts
    {
      entryPoints: ['test/room.test.ts'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: 'dist/test/room.test.js',
      sourcemap: true,
    },
  ];

  const ctxs = await Promise.all(configs.map((c) => esbuild.context(c)));

  if (isWatch) {
    await Promise.all(ctxs.map((ctx) => ctx.watch()));
    console.log('Watching for changes...');
  } else {
    await Promise.all(ctxs.map((ctx) => ctx.rebuild()));
    await Promise.all(ctxs.map((ctx) => ctx.dispose()));
    console.log('Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
