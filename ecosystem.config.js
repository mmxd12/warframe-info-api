module.exports = {
  apps: [{
    name: 'wf-api',
    script: './bin/www',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    watch: false,
    env: {
      NODE_OPTIONS: '--no-warnings',
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
