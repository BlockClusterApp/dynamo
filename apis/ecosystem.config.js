module.exports = {
  apps: [
    {
      name: 'api',
      script: '/dynamo/apis/app.js',
      watch: false,
      instances: 2,
      exec_mode: 'cluster',
      log_file: '/dynamo/bcData/combined.app.log',
      out_file: '/dynamo/bcData/app-stdout.log',
      error_file: '/dynamo/bcData/app-stderr.log'
    },
    {
      name: 'scanner',
      script: '/dynamo/apis/scanner.js',
      log_file: '/dynamo/bcData/combined.scanner.log',
      out_file: '/dynamo/bcData/scanner-stdout.log',
      error_file: '/dynamo/bcData/scanner-stderr.log'
    }
  ]
};
