const timestamp = ``;

module.exports = {
  apps: [
    {
      name: 'api',
      script: '/dynamo/apis/app.js',
      watch: false,
      instances: 2,
      exec_mode: 'cluster',
      log_file: `/dynamo/bcData/combined.app${timestamp}.log`,
      out_file: `/dynamo/bcData/app-stdout${timestamp}.log`,
      error_file: `/dynamo/bcData/app-stderr${timestamp}.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm Z'
    },
    {
      name: 'scanner',
      script: '/dynamo/apis/scanner.js',
      log_file: `/dynamo/bcData/combined.scanner${timestamp}.log`,
      out_file: `/dynamo/bcData/scanner-stdout${timestamp}.log`,
      error_file: `/dynamo/bcData/scanner-stderr${timestamp}.log`
    }
  ]
};
