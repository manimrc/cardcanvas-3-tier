module.exports = {
  apps: [
    {
      name: 'sleekly-frontend',
      script: 'server.js',
      cwd: '/var/www/sleekly-frontend',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
