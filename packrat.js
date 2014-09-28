var path = require('path'),
    fs = require('fs'),
    crypto = require('crypto'),
    util = require('util'),
    sh = require('execSync'),
    messages = require('./lib/messages'),
    PackratStorage = require('./lib/storage');

/**
 * Конструктор packrat-установки пакетов
 * @param {Object} opts
 * @param {String} opts.packageManager Название пакетного менеджера
 * @param {String} opts.installCommand Команда, которой менеджер устанавливает пакеты
 * @param {String} opts.sourceFile Файл с декларацией зависимостей (e.g. package.json)
 * @param {String} opts.directory Локальная директория, в которую менеджер устанавливает пакеты
 * @param {String} opts.storageRoot Путь до корня кэш-хранилища
 * @param {Boolean} opts.force Флаг про то, использовать ли форсированную установку
 * (перед ней будут удалены кэш и локальная директория с пакетами)
 * @param {Boolean} opts.verbose Флаг про вербозность
 * @param {Boolean} opts.info Флаг про то, нужно ли в конце установки вывести общую информацию
 * @constructor
 */
function Packrat(opts) {
    process.on('uncaughtException', this.onError.bind(this));

    this.force = opts.force;
    this.verbose = opts.verbose;
    this.info = opts.info;

    this.packageManager = opts.packageManager;
    this.installCommand = opts.installCommand;
    this.sourceFile = opts.sourceFile;
    this.localPackagesDir = opts.directory;
    this.storageRoot = opts.storageRoot;

    this.initInstallDefaults();
    this.initStorage();
}

Packrat.prototype.initInstallDefaults = function() {
    this.installLog = '';
};

Packrat.prototype.initStorage = function() {
    this.storage = new PackratStorage({
        localPackagesDir: this.localPackagesDir,
        rootPath: path.join(this.storageRoot, this.packageManager),
        instancePath: path.join(this.storageRoot, this.packageManager, this.createSourceHash())
    });

    this.storage.setRunner(function() {
        this.runCommand.apply(this, arguments);
    }.bind(this));
};

/**
 * Устанавливает пакеты.
 * Предварительно проверяет, есть ли в хранилище соответствующий кэш.
 * 1. Если кэш есть, копирует пакеты из него.
 * 2. Если кэша нет, устанавливает пакеты обычным образом, после установки копирует директорию в кэш.
 * 3. Если на месте кэша временный файл, то в данный момент идет параллельная установка по схеме из пункта 2.
 * Не будем мешать этой параллельной операции и просто установим пакеты обычным образом.
 */
Packrat.prototype.makeInstall = function() {
    if (this.force) {
        this.storage.clean();
        this.runCommand('rm -rf %s', this.localPackagesDir);
    }

    switch (this.storage.getStatus()) {
        case this.storage.status.PROGRESS :
            this.log(messages.INSTALL_PROGRESS(this.sourceFile));
            this.realInstall();
            break;

        case this.storage.status.EMPTY :
            this.log(messages.INSTALL_EMPTY());
            this.isProgress = true;
            this.storage.createTmpFile();
            this.realInstall();
            this.makeExport();
            break;

        case this.storage.status.READY :
            this.log(messages.INSTALL_READY());
            this.makeImport();
            break;
    }
};

/**
 * Экспортирует установленные обычным образом пакеты в хранилище.
 * Также копирует туда лог установки и создает файл со счетчиком установок из кэша.
 */
Packrat.prototype.makeExport = function() {
    try {
        fs.statSync(this.localPackagesDir);
        this.storage.exportToStorage(this.installLog);
    }
    catch (e) {
        this.log(messages.EXPORT_IMPOSSIBLE(this.localPackagesDir));
        process.exit(1);
    }
};

/**
 * Импортирует пакеты из кэша в локальную директорию.
 * Сохраненный при первой обычной установке лог, отдает в stdout.
 * Инкрементирует счетчик установок из кэша.
 */
Packrat.prototype.makeImport = function() {
    if (this.storage.getStatus() === this.storage.status.READY) {
        this.storage.importFromStorage();
        this.runCommand('cat %s', this.storage.installLogPath);

        if (this.info) {
            this.makeInfo();
        }
    }
    else {
        this.log(messages.IMPORT_IMPOSSIBLE(this.storage.instancePath));
        process.exit(1);
    }
};

/**
 * Удаляет кэш из хранилища.
 */
Packrat.prototype.makeClean = function() {
    this.log(messages.CLEANING_STORAGE_FILES(this.storage.instancePath));
    this.storage.clean();
};

/**
 * Выдает информацию о текущей конфигурации:
 * путь до кэша, само его наличие, количество установок из него, etc.
 */
Packrat.prototype.makeInfo = function() {
    this.log('Storage path:', this.storage.instancePath);
    this.log('Storage status:', this.storage.getStatus());
    this.log('Times storage was imported:', this.storage.getImportCounter());
    this.log('Install command: `%s`', this.installCommand);
    this.log('Local packages directory:', this.localPackagesDir);
    this.log('Package declaration file:', this.sourceFile);
};

/**
 * Обычная долгая установка пакетов при помощи пакетного менеджера.
 */
Packrat.prototype.realInstall = function() {
    this.log(messages.USUAL_INSTALL());
    this.installLog =
        this.runCommand(this.installCommand).stdout;
};

/**
 * Возвращает уникальный идентификатор для текущей конфигурации
 * (это обычный md5-хэш от файла с декларацией зависимостей).
 * @returns {String}
 */
Packrat.prototype.createSourceHash = function() {
    var hashSum = crypto.createHash('md5');

    try {
        hashSum.update(fs.readFileSync(this.sourceFile, 'utf8'));
    } catch(e) {
        this.onError(new Error(util.format('Source file `%s` does not exist', this.sourceFile)));
    }

    return hashSum.digest('hex');
};


/**
 * Обработчик неожиданных ошибок, случившихся во время установки.
 * Если перед этим установщик успел положить в хранилище временный файл,
 * нужно его удалить, чтобы не сломать следующую установку.
 * @param err
 * @param code
 */
Packrat.prototype.onError = function(err, code) {
    if (this.isProgress) {
        this.storage.deleteTmpFile();
    }

    console.error('Packrat unexpected error:', err.message);
    process.exit(code || 1);
};


/**
 * Синхронно выполняет shell-команду, логирует и возвращает ее вывод.
 * Команда склеивается из строк-аргументов при помощи `util.format()`
 * (это, например, означает, что в первой строке можно использовать плейсхолдеры).
 * @returns {{stdout: string} | undefined}
 */
Packrat.prototype.runCommand = function() {
    var command = util.format.apply(util, arguments),
        result;

    if (this.verbose) {
        this.log('Packrat is running `%s`...', command);
    }

    result = sh.exec(command, true);

    if (result.stdout) {
        this.log(result.stdout);
    }

    if (result.code !== 0) {
        this.onError(new Error(util.format('`%s` command failed', command)), result.code);
    }

    return result;
};

/**
 * Логгер сообщений.
 * Принимает произвольное количество строк в качестве аргументов,
 * выбрасывая из них пустые или содержащие только переводы строк.
 */
Packrat.prototype.log = function() {
    var logMessages = Array.prototype.slice.call(arguments).filter(function(message) {
        return message && ! /^(\n)+$/.test(message);
    });

    if (logMessages.length) {
        console.log.apply(console, logMessages);
    }
};

module.exports = Packrat;
