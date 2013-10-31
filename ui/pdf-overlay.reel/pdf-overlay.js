var Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise;

var _renderingPage = null,
    _renderingQueue = [],
    _pdf = {};



exports.PdfOverlay = Component.specialize({
    _item: {
        value: null
    },

    item: {
        get: function() {
            return this._item;
        },
        set: function(value) {
            if (this._item !== value) {
                this._item = value;

                if (_renderingPage !== value) {
                    var canvas = this.element,
                        ctx = canvas.getContext('2d');

                    // Erase the canvas
                    canvas.width = canvas.width;
                }

                this.needsDraw = true;
            }
        }
    },

    _originalUrl: {
        value: null
    },

    originalUrl: {
        get: function() {
            return this._originalUrl;
        },

        set: function(value) {
            this._originalUrl = value;
            this.needsDraw = true;
        }
    },

    draw: {
        value: function() {
            var item = this.item,
                canvas = this.element,
                ctx = canvas.getContext('2d'),
                ratio = window.devicePixelRatio / ctx.webkitBackingStorePixelRatio,
                width,
                height,
                radius = 10;

            // Set the logical size of the canvas to fit the item. Will fully reset the canvas
            if (item && item.type === "page" && item.url) {
                // Adjust the size to match the device pixel ratio (retina display)
                width = item.width * ratio;
                height = item.height * ratio;
                canvas.width = width;
                canvas.height = height;

                // Setup the rounded corners to match the iFrame
                ctx.beginPath();
                ctx.moveTo(radius, 0);
                ctx.arcTo(width, 0, width, height, radius);
                ctx.arcTo(width, height, 0, height, radius);
                ctx.arcTo(0, height, 0, 0, radius);
                ctx.arcTo(0, 0, width, 0, radius);
                ctx.clip();

                // Reset the path
                ctx.beginPath();
                this.render();
            } else {
                canvas.width = 0;
                canvas.height = 0;
            }
        }
    },

    _getDocument: {
        value: function(path) {
            var deferred = Promise.defer();

            if (_pdf[path]) {
                deferred.resolve(_pdf[path]);
            } else {
                PDFJS.getDocument(path).then(
                    function(pdf) {
                        _pdf[path] = pdf;
                        deferred.resolve(pdf);
                    },
                    function(exception) {
                        deferred.reject(exception);
                    }
                );
            }

            return deferred.promise;
        }
    },

    render: {
        value: function() {
            var self = this,
                item = this.item,
                canvas = this.element,
                ctx = canvas.getContext('2d'),
                pageNumber = item.url.match(/\/([0-9]*).xhtml$/)[1];

            if (!_renderingPage) {
                _renderingPage = item;

                var finalize = function() {
                    var object = _renderingQueue.splice(0, 1)[0];

                    _renderingPage = null;
                    if (object) {
                        object.needsDraw = true;
                    }
                };

                self._getDocument(this.originalUrl).then(
                    function(pdf) {
                        pdf.getPage(pageNumber).then(
                            function(page) {
                                var viewport = page.getViewport(1.0),
                                    scale = canvas.width /viewport.width,
                                    renderContext;

                                //Adjust the viewport to fit the canvas size
                                renderContext = {
                                    canvasContext: ctx,
                                    viewport: page.getViewport(scale)
                                },

                                page.render(renderContext).then(
                                    finalize,
                                    function(exception) {
                                        console.log("ERROR:", exception.message);
                                        finalize();
                                    },
                                    function(progress) {
                                    });
                            },
                            function(exception) {
                                console.log("ERROR:", exception.message);
                                finalize();
                            },
                            function(progress) {
                            });
                    },
                    function(exception) {
                        console.log("ERROR:", exception.message)
                        finalize();
                    });
            } else {
                var found = false;

                _renderingQueue.some(function(queueItem) {
                    if (queueItem.uuid == self.uuid) {
                        found = true;
                        return true;
                    }
                    return false;
                });

                if (!found) {
                    _renderingQueue.push(this);
                }
            }
        }
    }
});
