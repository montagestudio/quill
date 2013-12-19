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


    addCss: function(details) {
        var classNames = details.classNames,
            elementId = details.elementId,
            text = details.text;

        try {
            if (!document.getElementById(elementId).classList.contains(classNames)) {
                document.getElementById(elementId).classList.add(classNames);
            }
            // console.log("Added class " + classNames + " to " + text);

        } catch (e) {
            console.log("Failed to appy class " + classNames + " to " + elementId, e);
        }
    },

    removeCss: function(details) {
        var classNames = details.classNames,
            elementId = details.elementId,
            text = details.text;
        try {
            var classes = classNames.trim().split(" ");
            for (var i = 0; i < classes.length; i++) {
                if (document.getElementById(elementId).classList.contains(classes[i])) {
                    document.getElementById(elementId).classList.remove(classes[i]);
                }
                // console.log("Remove class " + classes[i] + " from " + text);

            }
        } catch (e) {
            console.log("Failed to remove class " + classNames + " to " + elementId, e);
        }
    },

    getReadingOrder: function(alignment) {
        console.log("Building reading order for the page " + window.location.href + " in the html controller.", alignment);
        var textNodes;
        try {
            textNodes = document.getElementById("textOverlay").getElementsByTagName("span");
        } catch (e) {
            console.warn(e);
            return [];
        }
        console.log(textNodes);
        var count =0,
            textNode;
        for (var node = 0; node < textNodes.length; node++) {
            textNode = textNodes[node];
            if (textNode.id.indexOf("w") === 0) {
                count++;
                this.sharedReadingOrderMethods.readingOrder.push({
                    "id": textNode.id,
                    "text": textNode.innerText.trim(),
                    "readingOrder": count
                });
            }
        }
        console.log(this.sharedReadingOrderMethods.readingOrder);

        /* mock highlight the words */
        var self = this;
        var highlightWord = function(word) {
            if (word >= self.sharedReadingOrderMethods.readingOrder.length) {
                return;
            }
            console.log("Highlighting " + word);
            var wordItem = self.sharedReadingOrderMethods.readingOrder[word];
            var element = document.getElementById(wordItem.id);
            element.classList.add("-epub-media-overlay-active");
            if (word > 0) {
                var previous = document.getElementById(self.sharedReadingOrderMethods.readingOrder[word - 1].id);
                previous.classList.remove("-epub-media-overlay-active");
            }
            window.setTimeout(function() {
                highlightWord(word+1);
            }, 300);
        };
        highlightWord(0);

        return this.sharedReadingOrderMethods.readingOrder;
    },

    sharedReadingOrderMethods: {
        hasReadAlong: function() {
            console.log("Asked the page " + window.location.href + " if it has read along.");
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
        readingOrder: []
    }
};
