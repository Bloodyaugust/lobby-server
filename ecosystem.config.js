module.exports = {
  apps : [{
    name: 'Lobby Server',
    script: 'index.js',
    watch: '.'
  }],

  deploy : {
    production : {
      user : 'root',
      host : '192.81.135.83',
      ref  : 'origin/master',
      repo : 'git@github.com:Bloodyaugust/lobby-server.git',
      path : '/var/www/lobby-server',
      key  : '~/.ssh/lobby_server_deploy_rsa.pub',
      'pre-deploy-local': '',
      'post-deploy' : 'yarn install && mv .env.prod .env && pm2 startOrReload ecosystem.config.js --env production --wait-ready',
      'pre-setup': ''
    }
  }
};
