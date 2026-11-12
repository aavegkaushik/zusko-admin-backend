// backend/ecosystem.config.cjs
// PM2 Production Process Management Configuration

module.exports = {
  apps: [
    {
      name: "zusko-vendor-backend",
      script: "Server.js",
      instances: "max", // Scale to all available CPU cores or set to 2 for smaller EC2 instances (t3.small/medium)
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
        REDIS_ENABLED: "true",
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 4000,
        REDIS_ENABLED: "false",
      },
      // Graceful shutdown & zero-downtime reloads
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 8000,
      restart_delay: 1000,
      max_restarts: 10,
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};

