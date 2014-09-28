var fs = require('fs'),
    path = require('path');

/**
 *
 * @param opts
 * @constructor
 */
function Storage(opts) {
    this.localPackagesDir = opts.localPackagesDir;
    this.rootPath = opts.rootPath;
    this.instancePath = opts.instancePath;

    this.modulesPath = path.join(this.instancePath, 'cache');
    this.installLogPath = path.join(this.instancePath, 'install.log');
    this.importCounterPath = path.join(this.instancePath, 'install.counter');
}

/**
 * Возвращает текущий статус кэша в хранилище.
 * `EMPTY`: кэша в хранилище нет.
 * `PROGRESS`: идет параллельная установка, скоро кэш появится.
 * `READY`: кэш готов к использованию.
 *
 * @returns {String}
 */
Storage.prototype.getStatus = function() {
    var stat;

    try {
        stat = fs.statSync(this.instancePath);
        if (stat.isFile()) {
            return this.status.PROGRESS;
        }
        else if (stat.isDirectory()) {
            return this.status.READY;
        }
    }
    catch(e) {
        return this.status.EMPTY;
    }
};

/**
 * Создает в хранилище временный пустой файл,
 * сообщающий параллельным установкам, что скоро на его месте появится кэш с пакетами.
 */
Storage.prototype.createTmpFile = function() {
    this.runCommand('mkdir -p %s', path.dirname(this.instancePath));
    this.runCommand('touch %s', this.instancePath);
};

/**
 * Удаляет этот временный файл из хранилища.
 */
Storage.prototype.deleteTmpFile = function() {
    if (this.getStatus() === this.status.PROGRESS) {
        this.runCommand('rm -rf %s', this.instancePath);
    }
};

/**
 * Создает в хранилище кэш from scratch, копирует туда локальную директорию с пакетами.
 * Также копирует туда лог установки и создает файл со счетчиком установок из кэша.
 * @param {String} installLog лог установки
 */
Storage.prototype.exportToStorage = function(installLog) {
    this.runCommand('rm -rf', this.instancePath);
    this.runCommand('mkdir -p', this.instancePath);
    this.runCommand('touch', this.importCounterPath);
    this.runCommand('touch', this.installLogPath);

    this.runCommand('cp -Tr %s %s', this.localPackagesDir, this.modulesPath);
    fs.writeFileSync(this.importCounterPath, '0');
    fs.writeFileSync(this.installLogPath, installLog);
};

/**
 * Импортирует пакеты из кэша в локальную директорию.
 * Инкрементирует счетчик установок из кэша.
 */
Storage.prototype.importFromStorage = function() {
    this.runCommand('cp -Tr %s %s', this.modulesPath, this.localPackagesDir);
    this.incrementImportCounter();
};

/**
 * Возвращает текущее значение счетчика установок из кэша
 * (`n/a`, если кэш еще не создан)
 * @returns {String}
 */
Storage.prototype.getImportCounter = function() {
    try {
        return fs.readFileSync(this.importCounterPath, 'utf8');
    } catch(e) {
        return 'n/a';
    }
};

/**
 * Инкрементирует счетчик установок из кэша.
 */
Storage.prototype.incrementImportCounter = function() {
    var counter = this.getImportCounter();

    counter = (parseInt(counter, 10) || 0) + 1;

    fs.writeFileSync(this.importCounterPath, String(counter));
};

/**
 * Удаляет кэш из хранилища.
 */
Storage.prototype.clean = function() {
    this.runCommand('rm -rf', this.instancePath);
};

/**
 * Устанавливает метод, которым будут выполняться shell-команды
 * @param {Function} runner
 */
Storage.prototype.setRunner = function(runner) {
    this.commandRunner = runner;
};

/**
 * Выполняет шелл-команду.
 * Команда склеивается из строк-аргументов при помощи `util.format()`
 * (это, например, означает, что в первой строке можно использовать плейсхолдеры).
 */
Storage.prototype.runCommand = function() {
    this.commandRunner.apply(this, arguments);
};


Storage.prototype.status = {
    'PROGRESS': 'PROGRESS',
    'EMPTY':    'EMPTY',
    'READY':    'READY'
};

module.exports = Storage;
