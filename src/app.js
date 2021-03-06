require.main.paths.splice(0, 0, process.env.NODE_PATH);
var remote = require('remote');
var Menu = remote.require('menu');
var React = require('react');
var SetupStore = require('./stores/SetupStore');
var ipc = require('ipc');
var machine = require('./utils/DockerMachineUtil');
var metrics = require('./utils/MetricsUtil');
var router = require('./router');
var template = require('./menutemplate');
var webUtil = require('./utils/WebUtil');
var urlUtil = require ('./utils/URLUtil');
var app = remote.require('app');
var request = require('request');
var docker = require('./utils/DockerUtil');

webUtil.addWindowSizeSaving();
webUtil.addLiveReload();
webUtil.addBugReporting();
webUtil.disableGlobalBackspace();

Menu.setApplicationMenu(Menu.buildFromTemplate(template()));

metrics.track('Started App');
metrics.track('app heartbeat');
setInterval(function () {
  metrics.track('app heartbeat');
}, 14400000);

router.run(Handler => React.render(<Handler/>, document.body));

SetupStore.setup().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template()));
  docker.init();
  router.transitionTo('search');
}).catch(err => {
  metrics.track('Setup Failed', {
    step: 'catch',
    message: err.message
  });
  throw err;
});

ipc.on('application:quitting', () => {
  if (localStorage.getItem('settings.closeVMOnQuit') === 'true') {
    machine.stop();
  }
});

// Event fires when the app receives a docker:// URL such as
// docker://repository/run/redis
ipc.on('application:open-url', opts => {
  request.get('https://kitematic.com/flags.json', (err, response, body) => {
    if (err || response.statusCode !== 200) {
      return;
    }

    var flags = JSON.parse(body);
    if (!flags) {
      return;
    }

    urlUtil.openUrl(opts.url, flags, app.getVersion());
  });
});
