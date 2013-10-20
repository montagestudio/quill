/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component;

exports.Main = Component.specialize({

    params: {
        value: {
            p: 1,
            path: null
        }
    },

    templateDidLoad: {
        value: function() {
            var searches = document.location.search.substr(1).split("&"),
                self = this;

            searches.forEach(function (search) {
                var param = search.split("=");
                self.params[decodeURIComponent(param[0])] = param.length > 1 ? decodeURIComponent(param[1]) : null;
            });
        }
    }
});
