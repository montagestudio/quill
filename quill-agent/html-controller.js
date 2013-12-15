/**
 * This controller facilitates reading and writing to a live HTML document
 */
var HtmlController = function (document) {
    this.document = document;
};

HtmlController.prototype = {

    document: null,

    //TODO accept element directly? expose element(s)WithSelector as an intermediate step?
    //NOTE this is enough API to prove the the concept
    addClassName: function (selector, className) {
        var element = this.document.querySelector(selector);
        if (element) {
            element.classList.add(className);
        }
    },

    removeClassName: function (selector, className) {
        var element = this.document.querySelector(selector);
        if (element) {
            element.classList.remove(className);
        }
    },

    hasCopyright: function () {
        return !!this.document.getElementById("scholastic-e-copyright");
    },

    copyrightPosition: function () {
        var banner = this.document.querySelector(".copyright-banner"),
            result;

        if (!banner) {
            result = null;
        } else if (banner.classList.contains("banner-top")) {
            result = "top";
        } else if (banner.classList.contains("banner-right")) {
            result = "right";
        } else if (banner.classList.contains("banner-bottom")) {
            result = "bottom";
        } else if (banner.classList.contains("banner-left")) {
            result = "left";
        }

        return result;
    },

    setCopyrightPosition: function (position) {
        var banner = this.document.querySelector(".copyright-banner");

        if (!banner) {
            return;
        }

        banner.classList.remove("banner-top");
        banner.classList.remove("banner-right");
        banner.classList.remove("banner-bottom");
        banner.classList.remove("banner-left");

        switch (position) {
        case "top":
            banner.classList.add("banner-top");
            break;
        case "right":
            banner.classList.add("banner-right");
            break;
        case "bottom":
            banner.classList.add("banner-bottom");
            break;
        case "left":
            banner.classList.add("banner-left");
            break;
        }
    },

    documentContent: function () {
        return (new XMLSerializer()).serializeToString(this.document);
    },


    sharedReadingOrderMethods: {
        hasReadAlong: function() {
            // return !!this.document.getElementById("read-along-details");
            return true;
        },
        getReadingOrderFromXHTML: function() {
            var deferred = Q.defer();

            var self = this;
            window.setTimeout(function() {

                console.log("getReadingOrderFromXHTML");
                deferred.resolve(self.readingOrder);

            }, 100);
            return deferred.promise;
        },
        runSomethingWithProgressNotifications: function(times) {
            var deferred = Q.defer();
            var count = 0;
            setTimeout(function() {
                while (count++ < times) {
                    console.log('Notify' + count + ' time');
                    deferred.notify('Notify' + count + ' time');
                }
                deferred.resolve('Resolving');
            }, 0);
            return deferred.promise;
        },
        respond: function() {
            return Q.defer().promise;
        },
        readingOrder: [{
            "id": "w1",
            "text": "Hello"
        }, {
            "id": "w2",
            "text": "I'm"
        }, {
            "id": "w4",
            "text": "Emily"
        }, {
            "id": "w5",
            "text": "Elizabeth!"
        }]
    }
};
