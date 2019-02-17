module.exports = {
  apps : [{
    name: 'OmniSync',
    script: 'index.js',
    instances: 1,
    autorestart: false,
    watch: false,
    cron_restart: "*/15 * * * *",
    env: {
      NODE_ENV: 'production'
    },
  }],

};
