var util = require('util');

/**
 * Возвращает сообщение типа "Some arg should be one of `x`, `y` or `z`"
 * @param {String} message Заготовка сообщения вида "Some arg should be one of %s"
 * @param {Array} args Варианты значения аргумента
 * @returns {String}
 */
function createArgTitle(message, args) {
    var argsInMessage = args.map(function(arg, index) {
        var prefix;

        if (index === 0) {
            prefix = ''
        } else if (index + 1 !== args.length) {
            prefix = ', ';
        } else {
            prefix = ' or ';
        }

        return prefix + '`' + arg + '`';
    }).join('');

    return util.format(message, argsInMessage);
}

module.exports = {
    createArgTitle: createArgTitle
};
