/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component;

var IS_IN_LUMIERES = (typeof lumieres !== "undefined");

exports.Main = Montage.create(Component, {

    params: {
        value: {
            p: 1,
            path: null
        }
    },

    didCreate: {
        value: function () {
        }
    },

    templateDidLoad: {
        value: function() {
            foo = this;

            var searches = document.location.search.substr(1).split("&"),
                i;

            for (i in searches) {
                var param = searches[i].split("=");
                this.params[decodeURIComponent(param[0])] = param.length > 1 ? decodeURIComponent(param[1]) : null;
            }
        }
    }
});
