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
            console.log("templateDidLoad");
            foo = this;

            var searches = document.location.search.substr(1).split("&"),
                i;

            for (i in searches) {
                var param = searches[i].split("=");
                this.params[unescape(param[0])] = param.length > 1 ? unescape(param[1]) : null;
            }
            console.log(this.params);

////            setupLocalFileSystem(function(fs, error) {
//                if (error === undefined) {
//                    console.log('Opened file system: ' + fs.name, fs);
//                    globalScope.fs = fs;
//                }
//
//                loadPDFDocument("samples/hello.pdf", function(pdf, page) {
//                   console.log("pdf document loaded", pdf, page);
//               })
////            });

        }
    }
});
