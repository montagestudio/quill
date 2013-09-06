var Montage = require("montage/core/core").Montage,
    Converter = require("montage/core/converter/converter").Converter;

exports.HistoryItemNameConverter = Converter.specialize({

    allowPartialConversion: {
        value: false
    },

    convert: {value: decodeURI},
    revert: {value: encodeURI}

});
