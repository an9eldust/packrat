#!/usr/bin/env node

var Packrat = require('./packrat'),
    extend = require('extend'),
    config = require('./config'),
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
            if ([ 'install' ].indexOf(value) === -1) {
                return this.reject('Package manager action should be `install`');
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
        packrat = new Packrat(packratConfig);

        packrat['make' + action]();
    })
    .run(process.argv.slice(2));
