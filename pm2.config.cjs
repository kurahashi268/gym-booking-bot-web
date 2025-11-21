module.exports = {
  apps: [{
    name: 'bot-webui',
    script: 'server.js', // or your main file
    instances: 1, // use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      HOST: 'localhost',
      AUTH_SALT: 'ritmos-bot-salt',
      BOT_DIR: '../bot/dist',
      AUTH_PATH: './auth.json',
      BOT_ESTIMATED_ELAPSED_SECONDS: 120,
      MAX_PROFILE: 4,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: 'localhost',
      AUTH_SALT: 'ritmos-bot-salt',
      BOT_DIR: '../bot/dist',
      AUTH_PATH: './auth.json',
      BOT_ESTIMATED_ELAPSED_SECONDS: 120,
      MAX_PROFILE: 4,
    }
  }]
};
