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
    }

};
