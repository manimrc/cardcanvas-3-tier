module.exports = {
  apps: [
    {
      name: 'cardcanvas-frontend',
      script: 'server.js',
      cwd: '/var/www/cardcanvas-frontend',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
