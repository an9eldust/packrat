#!/usr/bin/env node

var Packrat = require('../packrat'),
    extend = require('extend'),
    fs = require('fs'),
    config = require('./config'),
    coaHelpers = require('./coa-helpers'),
    projectConfig,
    availableManagers,
    availableActions;

try {
    projectConfig = JSON.parse(fs.readFileSync('.packratrc'));
}
catch (e) {}

config = extend(true, config, projectConfig);
availableManagers = Object.keys(config);
availableActions = Object.keys(Packrat.prototype)
    .filter(function(key) {
        return typeof Packrat.prototype[key] === 'function';
    })
    .filter(function(methodName) {
        return /^make/.test(methodName);
    })
    .map(function(methodName) {
        return methodName.replace(/^make/, '').toLowerCase();
    });

require('coa').Cmd()
    .name(process.argv[1])
    .title('@todo')
    .helpful()
    .arg()
        .name('packageManager')
        .title(coaHelpers.createArgTitle('Package manager; one of %s', availableManagers))
        .val(function(manager) {
            if (availableManagers.indexOf(manager) === -1) {
                return this.reject(coaHelpers.createArgTitle('Package manager should be one of %s', availableManagers));
            }
            return manager;
        })
        .req()
        .end()
    .arg()
        .name('action')
        .title(coaHelpers.createArgTitle('Action; one of %s', availableActions))
        .val(function(action) {
            if (availableActions.indexOf(action) === -1) {
                return this.reject(coaHelpers.createArgTitle('Action should be one of %s', availableActions));
            }
            return action;
        })
        .req()
        .end()
    .opt()
        .name('force')
        .title('force')
        .long('force')
        .flag()
        .end()
    .act(function(opts, args) {
        var packrat,
            action = args.action,
            packratConfig = config[args.packageManager];

        action = action[0].toUpperCase() + action.slice(1);
        packratConfig.packageManager = args.packageManager;
        packratConfig.force = opts.force;

        packrat = new Packrat(packratConfig);
        packrat['make' + action]();
    })
    .run(process.argv.slice(2));
