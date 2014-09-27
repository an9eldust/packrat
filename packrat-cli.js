#!/usr/bin/env node

var Packrat = require('./packrat'),
    extend = require('extend'),
    config = require('./config'),
    util = require('util'),
    fs = require('fs'),
    rc;

try {
    rc = JSON.parse(fs.readFileSync('.packratrc'));
}
catch (e) {}

require('coa').Cmd()
    .name(process.argv[1])
    .title('@todo')
    .helpful()
    .arg()
        .name('packageManager')
        .title('Package manager; one of: npm or bower')
        .val(function(value) {
            if ([ 'npm', 'bower' ].indexOf(value) === -1) {
                return this.reject('Package manager should be `npm` or `bower`');
            }
            return value;
        })
        .req()
        .end()
    .arg()
        .name('action')
        .title('action')
        .val(function(value) {
            var availableActions = [ 'install', 'export', 'import', 'clean', 'info' ],
                rejectMessageActions = availableActions.map(function(action) {
                    return '`' + action + '`';
                }).join(', '),
                rejectMessage = util.format('Package manager action should be one of %s', rejectMessageActions);

            if (availableActions.indexOf(value) === -1) {
                return this.reject(rejectMessage);
            }

            return value;
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
            packratConfig = extend(true, config, rc)[args.packageManager];

        action = action[0].toUpperCase() + action.slice(1);
        packratConfig.packageManager = args.packageManager;
        packratConfig.force = opts.force;

        packrat = new Packrat(packratConfig);
        packrat['make' + action]();
    })
    .run(process.argv.slice(2));
