module.exports = {
  apps: [
    // {
    //   name: "gatti-bot",
    //   script: "./gatti.js",
    //   cwd: __dirname,
    //   interpreter: "node",
    //   watch: false,
    //   autorestart: true,
    //   max_restarts: 10,
    //   restart_delay: 2000,
    //   env: {
    //     NODE_ENV: "production",
    //   },
    // },
    {
      name: "gabot",
      script: "./gabot_ofertas.js",
      cwd: __dirname,
      interpreter: "node",
      watch: false,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: "256M",
      exp_backoff_restart_delay: 1000,
      env_file: ".env",
      env: {
        NODE_ENV: "production",
      },
    },
    // {
    //   name: "gatti-updater",
    //   script: "./updater.js",
    //   cwd: __dirname,
    //   interpreter: "node",
    //   watch: false,
    //   autorestart: true,
    //   max_restarts: 10,
    //   restart_delay: 2000,
    //   env: {
    //     NODE_ENV: "production",
    //     UPDATE_CHECK_INTERVAL_MS: "300000",
    //   },
    // },
  ],
};
