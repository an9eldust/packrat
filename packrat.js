var path = require('path'),
    fs = require('fs'),
    crypto = require('crypto'),
    util = require('util'),
    sh = require('execSync');

function Packrat(opts) {
    this.packageManager = opts.packageManager;
    this.installCommand = opts.installCommand;
    this.sourceFile = opts.sourceFile;
    this.storageRoot = opts.storageRoot;
    this.packageDir = opts.directory;
    this.sourceHash = this.createSourceHash();
    this.storagePath = path.join(this.storageRoot, this.packageManager, this.sourceHash);
    this.storageModulesPath = path.join(this.storagePath, this.sourceHash);
    this.storageLogPath = path.join(this.storagePath, 'install.log');
    this.storageImportCounterPath = path.join(this.storagePath, 'counter');
    this.installLog = '';

    this.catchExceptions();
}

/**
 * @see Packrat#messages
 */
Packrat.prototype.status = {
    'AWAIT': 'AWAIT',
    'EMPTY': 'EMPTY',
    'READY': 'READY'
};

Packrat.prototype.messages = {
    AWAIT:  'Someone has already started installing with the same %s and is going to export.\n' +
            'We should just install packages.',
    EMPTY:  'Storage is empty: we will install packages the usual way' +
            ' and then export installed to storage',
    READY:  'Storage is ready to be imported.\n' +
            'No install needed; we will just copy packages from storage to local directory.'
};

Packrat.prototype.makeInstall = function() {
    this.storageStatus = this.checkStorage();

    switch (this.storageStatus) {
        case this.status.AWAIT :
            this.log(this.messages.AWAIT);
            this.realInstall();
            break;

        case this.status.EMPTY :
            this.log(this.messages.EMPTY);
            this.createTmpFile();
            this.realInstall();
            this.makeExport();
            break;

        case this.status.READY :
            this.log(this.messages.READY);
            this.makeImport();
    }
};

Packrat.prototype.checkStorage = function() {
    var stat;

    try {
        stat = fs.statSync(this.storagePath);
        if (stat.isFile()) {
            return this.status.AWAIT;
        }
        else if (stat.isDirectory()) {
            return this.status.READY;
        }
    }
    catch(e) {
        return this.status.EMPTY;
    }
};

Packrat.prototype.createSourceHash = function() {
    var hashSum = crypto.createHash('md5');

    hashSum.update(fs.readFileSync(this.sourceFile, 'utf8'));

    return hashSum.digest('hex');
};

Packrat.prototype.createTmpFile = function() {
    this.runCommand('mkdir -p %s', path.dirname(this.storagePath));
    this.runCommand('touch %s', this.storagePath);
};

Packrat.prototype.realInstall = function() {
    this.log('Usual packages installing takes a while (which you already know). Please wait');
    this.installLog =
        this.runCommand(this.installCommand).stdout;
};

Packrat.prototype.makeExport = function() {
    this.runCommand('rm %s', this.storagePath);
    this.runCommand('mkdir -p', this.storagePath);

    this.runCommand('cp -Tr %s %s', this.packageDir, this.storageModulesPath);
    this.runCommand('touch %s %s', this.storageImportCounterPath, this.storageLogPath);

    fs.writeFileSync(this.storageImportCounterPath, '0');
    fs.writeFileSync(this.storageLogPath, this.installLog);
};

Packrat.prototype.makeImport = function() {
    this.runCommand('cp -Tr %s %s', this.storageModulesPath, this.packageDir);
    this.runCommand('cat %s', this.storageLogPath);
    this.updateImportCounter();
};

Packrat.prototype.updateImportCounter = function() {
    var counter = fs.readFileSync(this.storageImportCounterPath, 'utf8');

    counter = parseInt(counter, 10) + 1;

    fs.writeFileSync(this.storageImportCounterPath, String(counter));
};

Packrat.prototype.runCommand = function() {
    var command = util.format.apply(util, arguments),
        result;

    this.log('run command `%s`', command);

    result = sh.exec(command, true);

    if (result.stdout) {
        this.log(result.stdout);
    }

    if (result.code !== 0) {
        this.errClean();
        console.error('ERROR:', util.format('`%s` command failed', command));
        process.exit(result.code);
    }

    return result;
};

Packrat.prototype.errClean = function() {
    if (this.storageStatus === this.status.EMPTY) {
        this.runCommand('rm %s', this.storagePath);
    }
};

Packrat.prototype.catchExceptions = function() {
    process.on('uncaughtException', function (err) {
        this.errClean();
        console.error('Error:', err.message);
        process.exit(1);
    }.bind(this));
};

Packrat.prototype.log = function() {
    console.log.apply(console, arguments);
};

module.exports = Packrat;
