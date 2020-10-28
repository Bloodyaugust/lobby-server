module.exports = {
  apps : [{
    name: 'Lobby Server',
    script: 'index.js',
    watch: '.'
  }, {
    script: './service-worker/',
    watch: ['./service-worker']
  }],

  deploy : {
    production : {
      user : 'root',
      host : '192.81.135.1',
      ref  : 'origin/master',
      repo : 'git@github.com:Bloodyaugust/lobby-server.git',
      path : '/var/www/lobby-server',
      key  : '~/.ssh/deploy_rsa.pub',
      'pre-deploy-local': '',
      'post-deploy' : 'yarn install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
