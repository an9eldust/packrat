var fs = require('fs'),
    path = require('path'),
    timer = require('contimer');

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
    this.installTimePath = path.join(this.instancePath, 'install.time');
    this.importCounterPath = path.join(this.instancePath, 'import.counter');
    this.importTimePath = path.join(this.instancePath, 'import.time');
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
 *
 * @param {Object} installProps Объект со сведениями об установке
 * @param {String} installProps.log Лог установки
 * @param {Number} installProps.time Время установки в мс
 */
Storage.prototype.exportToStorage = function(installProps) {
    this.runCommand('rm -rf', this.instancePath);
    this.runCommand('mkdir -p', this.instancePath);
    this.runCommand('touch', this.importCounterPath);
    this.runCommand('touch', this.installLogPath);
    this.runCommand('touch', this.installTimePath);
    this.runCommand('touch', this.importTimePath);

    this.runCommand('cp -Tr %s %s', this.localPackagesDir, this.modulesPath);
    fs.writeFileSync(this.importCounterPath, '0');
    fs.writeFileSync(this.installLogPath, installProps.log);
    fs.writeFileSync(this.installTimePath, String(installProps.time));
    fs.writeFileSync(this.importTimePath, '0');
};

/**
 * Импортирует пакеты из кэша в локальную директорию.
 * Инкрементирует счетчик установок из кэша.
 * Обновляет среднее время установки из кэша.
 */
Storage.prototype.importFromStorage = function() {
    timer.start(this, 'importTime');
    this.runCommand('cp -Tr %s %s', this.modulesPath, this.localPackagesDir);

    this.updateMeanImportTime(timer.stop(this, 'importTime').time);
    this.incrementImportCounter();
};

/**
 * Возвращает время реальной установки пакетов
 * (`n/a`, если кэш еще не создан)
 * @returns {String|Number}
 */
Storage.prototype.getInstallTime = function() {
    return this.getCacheParameter(this.installTimePath);
};

/**
 * Возвращает среднее время установки из кэша
 * (`n/a`, если кэш еще не создан)
 * @returns {String|Number}
 */
Storage.prototype.getMeanImportTime = function() {
    return this.getCacheParameter(this.importTimePath);
};

/**
 * Обновляет среднее время установки из кэша
 */
Storage.prototype.updateMeanImportTime = function(currentImportTime) {
    var meanImportTime = this.getMeanImportTime(),
        importCounter = this.getImportCounter();

    meanImportTime = Math.round(((meanImportTime * importCounter) + currentImportTime) / (importCounter + 1));

    fs.writeFileSync(this.importTimePath, String(meanImportTime));
};

/**
 * Возвращает текущее значение счетчика установок из кэша
 * (`n/a`, если кэш еще не создан)
 * @returns {String|Number}
 */
Storage.prototype.getImportCounter = function() {
    return this.getCacheParameter(this.importCounterPath);
};

/**
 * Инкрементирует счетчик установок из кэша.
 */
Storage.prototype.incrementImportCounter = function() {
    fs.writeFileSync(this.importCounterPath, String(this.getImportCounter() + 1));
};


/**
 * Возвращает время, сэкономленное на всех установках из кэша.
 * Если ни одной установки из кэша еще не было, возвращает "n/a"
 * @returns {Number|String}
 */
Storage.prototype.getShavedTime = function() {
    var importCounter = this.getImportCounter(),
        installTime = this.getInstallTime(),
        importTime = this.getMeanImportTime();

    if (typeof importCounter === 'number' &&
        typeof installTime === 'number' &&
        typeof importTime === 'number') {
            return (installTime - importTime) * importCounter;
    }
    else {
        return 'n/a';
    }
};

/**
 * Возвращает значение численного параметра из кэша
 * (среднее время установки, количество установок, etc).
 * @param {String} pathToParameter путь до файла со значением параметра
 * @returns {String|Number}
 */
Storage.prototype.getCacheParameter = function(pathToParameter) {
    try {
        return Number(fs.readFileSync(pathToParameter, 'utf8'));
    } catch(e) {
        return 'n/a';
    }
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
