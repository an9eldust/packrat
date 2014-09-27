var path = require('path'),
    fs = require('fs'),
    crypto = require('crypto'),
    util = require('util'),
    sh = require('execSync');

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
 * @constructor
 */
function Packrat(opts) {
    this.force = opts.force;

    this.packageManager = opts.packageManager;
    this.installCommand = opts.installCommand;
    this.sourceFile = opts.sourceFile;
    this.packageDir = opts.directory;
    this.sourceHash = this.createSourceHash();

    this.storageRoot = opts.storageRoot;
    this.storagePath = path.join(this.storageRoot, this.packageManager, this.sourceHash);
    this.storageModulesPath = path.join(this.storagePath, this.sourceHash);
    this.storageLogPath = path.join(this.storagePath, 'install.log');
    this.storageImportCounterPath = path.join(this.storagePath, 'counter');
    this.setStorageStatus();

    this.installLog = '';

    process.on('uncaughtException', this.onError.bind(this));
}

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
        this.forceInstall();
        return;
    }

    switch (this.storageStatus) {
        case this.status.AWAIT :
            this.log(this.messages.AWAIT, this.sourceFile);
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
            break;
    }
};

/**
 * Экспортирует установленные обычным образом пакеты в хранилище.
 * Также копирует туда лог установки и создает файл со счетчиком установок из кэша.
 */
Packrat.prototype.makeExport = function() {
    this.runCommand('rm -f %s', this.storagePath);
    this.runCommand('mkdir -p', this.storagePath);

    this.runCommand('cp -Tr %s %s', this.packageDir, this.storageModulesPath);
    this.runCommand('touch %s %s', this.storageImportCounterPath, this.storageLogPath);

    fs.writeFileSync(this.storageImportCounterPath, '0');
    fs.writeFileSync(this.storageLogPath, this.installLog);
};

/**
 * Импортирует пакеты из кэша в локальную директорию.
 * Сохраненный при первой обычной установке лог, отдает в stdout.
 * Инкрементирует счетчик установок из кэша.
 */
Packrat.prototype.makeImport = function() {
    this.runCommand('cp -Tr %s %s', this.storageModulesPath, this.packageDir);
    this.runCommand('echo; cat %s', this.storageLogPath);
    this.updateImportCounter();
};

/**
 * Удаляет кэш из хранилища.
 */
Packrat.prototype.makeClean = function() {
    this.log('Cleaning storage files...');
    this.runCommand('rm -rf %s', this.storagePath);
};

/**
 * Выдает информацию о текущей конфигурации:
 * путь до кэша, само его наличие, количество установок из него, etc.
 */
Packrat.prototype.makeInfo = function() {
    this.log();
    this.log('Storage path:', this.storagePath);
    this.log('Storage status:', this.storageStatus);
    this.log('Times storage was imported:', this.getImportCounter());
    this.log('Install command: `%s`', this.installCommand);
    this.log('Local packages directory:', this.packageDir);
    this.log('Package declaration file:', this.sourceFile);
    this.log();
};

/**
 * Форсированная установка пакетов,
 * не обращающая внимания ни на наличие локальной директории, ни на наличие кэша.
 */
Packrat.prototype.forceInstall = function() {
    this.runCommand('rm -rf %s', this.packageDir);
    this.makeClean();
    this.setStorageStatus();

    delete this.force;
    this.makeInstall();
};

/**
 * Обычная долгая установка пакетов при помощи пакетного менеджера.
 */
Packrat.prototype.realInstall = function() {
    this.log('\nUsual packages installing takes a while (as you already know). Please wait!..\n');
    this.installLog =
        this.runCommand(this.installCommand).stdout;
};

/**
 * Выясняет текущее состояние кэша в хранилище (есть/нет/временный файл)
 * и устанавливает соответствующее свойство в инстанс.
 */
Packrat.prototype.setStorageStatus = function() {
    var stat;

    try {
        stat = fs.statSync(this.storagePath);
        if (stat.isFile()) {
            this.storageStatus = this.status.AWAIT;
        }
        else if (stat.isDirectory()) {
            this.storageStatus = this.status.READY;
        }
    }
    catch(e) {
        this.storageStatus = this.status.EMPTY;
    }
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
 * Создает в хранилище временный пустой файл,
 * сообщающий параллельным установкам, что в кэш скоро будут сложены пакеты.
 */
Packrat.prototype.createTmpFile = function() {
    this.runCommand('mkdir -p %s', path.dirname(this.storagePath));
    this.runCommand('touch %s', this.storagePath);
};

/**
 * Инкрементирует счетчик установок из кэша.
 */
Packrat.prototype.updateImportCounter = function() {
    var counter = this.getImportCounter();

    counter = parseInt(counter, 10) + 1;

    fs.writeFileSync(this.storageImportCounterPath, String(counter));
};

/**
 * Возвращает текущее значение счетчика установок из кэша
 * @returns {String}
 */
Packrat.prototype.getImportCounter = function() {
    try {
        return fs.readFileSync(this.storageImportCounterPath, 'utf8');
    } catch(e) {
        return 'n/a';
    }
};


/**
 * Обработчик неожиданных ошибок, случившихся во время установки.
 * Если перед этим установщик успел положить в хранилище временный файл,
 * нужно его удалить, чтобы не сломать следующую установку.
 * @param err
 */
Packrat.prototype.onError = function(err) {
    if (this.storageStatus === this.status.EMPTY) {
        this.makeClean();
    }

    console.error('Packrat unexpected error:', err.message);
    process.exit(1);
};


/**
 * Синхронно выполняет shell-команду,
 * логирует и возвращает ее вывод.
 * @returns {{stdout: string}|undefined}
 */
Packrat.prototype.runCommand = function() {
    var command = util.format.apply(util, arguments),
        result;

    this.log('Packrat is running `%s`...', command);

    result = sh.exec(command, true);

    if (result.stdout) {
        this.log(result.stdout);
    }

    if (result.code !== 0) {
        this.onError();
        console.error('ERROR:', util.format('`%s` command failed', command));
        process.exit(result.code);
    }

    return result;
};

/**
 * Логгер сообщений от установщика
 */
Packrat.prototype.log = function() {
    console.log.apply(console, arguments);
};


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

module.exports = Packrat;
