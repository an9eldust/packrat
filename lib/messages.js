var util = require('util');

module.exports = {
    /**
     * @param {String} sourceFile Файл декларации зависимостей (e.g. `package.json`)
     * @returns {String}
     */
    INSTALL_PROGRESS: function(sourceFile) {
        return util.format('Storage is in PROGRESS.\n' +
               'Someone has already started installing with the same `%s` ' +
               'and is going to export cache soon.\n' +
               'We should just install packages.', sourceFile);
    },

    /**
     * @returns {String}
     */
    INSTALL_READY: function() {
        return 'Storage is READY to be imported.\n' +
               'No install needed; we will just copy packages from storage to local directory.';
    },

    /**
     * @returns {String}
     */
    INSTALL_EMPTY: function() {
        return  'Storage is EMPTY.\n' +
                'We will install packages the usual way and then export installed to storage';
    },

    IMPORT_IMPOSSIBLE: function(cacheDir) {
        return util.format('Import is impossible since cache directory at `%s` is missing', cacheDir);
    },

    EXPORT_IMPOSSIBLE: function(localPackagesDir) {
        return util.format('Export is impossible since local packages directory `%s` is missing', localPackagesDir);
    },

    CLEANING_STORAGE_FILES: function(cacheDir) {
        return util.format('Packrat is removing cache at `%s`', cacheDir);
    },

    USUAL_INSTALL: function() {
        return 'Usual packages installing takes a while (as you already know). Please wait!..\n';
    }
};
