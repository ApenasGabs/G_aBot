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
      max_restarts: 10,
      restart_delay: 2000,
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
