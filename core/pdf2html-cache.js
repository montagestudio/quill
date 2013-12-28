/*jshint camelcase:false, maxcomplexity:11 */ // TODO: fix these warnings
/*global lumieres, PDFJS, ImageData, createScratchCanvas */
var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    adaptConnection = require("q-connection/adapt"),
    Connection = require("q-connection");


var IS_IN_LUMIERES = (typeof lumieres !== "undefined");
// TODO DRY pdf2html
function putBinaryImageData(ctx, data, w, h) {
    var tmpImgData = 'createImageData' in ctx ? ctx.createImageData(w, h) :
        ctx.getImageData(0, 0, w, h);

    var tmpImgDataPixels = tmpImgData.data;
    if ('set' in tmpImgDataPixels) {
        tmpImgDataPixels.set(data);
    } else {
        // Copy over the imageData pixel by pixel.
        for (var i = 0, ii = tmpImgDataPixels.length; i < ii; i++) {
            tmpImgDataPixels[i] = data[i];
        }
    }

    ctx.putImageData(tmpImgData, 0, 0);
}

function bytesFromDataURL(dataURL) {
    // convert base64 to raw binary data held in a string
    // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
    var byteString = atob(dataURL.split(',')[1]);

    // write the bytes of the string to an Uint8Array
    var length = byteString.length,
        bytes = new Uint8Array(length);

    for (var i = 0; i < length; i++) {
        bytes[i] = byteString.charCodeAt(i);
    }

    return bytes;
}

function bytesArrayToArray(bytes) {
    var length = bytes.length,
        array = new Array(length);

    for (var i = 0; i < length; i++) {
        array[i] = bytes[i];
    }

    return array;
}

function checkForTransparency(data) {
    var length = data.length,
        i;

    for (i = 3; i < length; i += 4) {
        if (data[i] !== 255) {
            return true;
        }
    }

    return false;
}

exports.PDF2HTMLCache = Montage.specialize({

    _backend: {
        value: null
    },

    backend: {
        get: function () {
            var self = this,
                resolvePort = function () {
                    if (lumieres.nodePort) {
                        port.resolve(lumieres.nodePort);
                    }
                };

            if (self._backend == null) {
                var port = Promise.defer();
                if (lumieres.nodePort) {
                    port.resolve(lumieres.nodePort);
                } else {
                    while (port.promise.isPending()) {
                        port.promise.delay(20).then(resolvePort);
                    }
                }
                var connection = adaptConnection(new WebSocket("ws://localhost:" + lumieres.nodePort));
                connection.closed.then(function () {
                    self._backend = null;
                });

                self._backend = Connection(connection);
            }

            return self._backend;
        }
    },

    assetsFolderPath: {
        value: null
    },

    fontsFolderPath: {
        value: null
    },

    _log: {
        value: null
    },

    log: {
        value: function() {
            if (this._log) {
                this._log.apply(arguments);
            }
        }
    },

    initialize: {
        value: function(assetsPath, fontsPath, pdf, log) {
            var self = this,
                deferred = Promise.defer();

            if (IS_IN_LUMIERES) {
//                console.log(">>> SETUP CACHE FOR", decodeURIComponent(path.substring("fs://localhost".length)), pdf.pdfInfo.fingerprint);

                if (typeof log === "function") {
                    self._log = log;
                }

                if (assetsPath.indexOf("fs://localhost") === 0 && fontsPath.indexOf("fs://localhost") === 0) {
                    var fs = self.backend.get("fs");

                    this.assetsFolderPath = decodeURIComponent(assetsPath.substring("fs://localhost".length));
                    if (this.assetsFolderPath.charAt(this.assetsFolderPath.length - 1) !== "/") {
                        this.assetsFolderPath += "/";
                    }

                    this.fontsFolderPath = decodeURIComponent(fontsPath.substring("fs://localhost".length));
                    if (this.fontsFolderPath.charAt(this.fontsFolderPath.length - 1) !== "/") {
                        this.fontsFolderPath += "/";
                    }

                    fs.invoke("makeTree", self.assetsFolderPath).then(function() {
                        fs.invoke("exists", self.assetsFolderPath).then(function(exists){
                            if (exists) {
                                deferred.resolve(self);
                            } else {
                                deferred.reject("Cannot initialize the PDF assets cache: cache path does not exist!");
                            }
                        });
                    }).done(function() {
                        fs.invoke("makeTree", self.fontsFolderPath).then(function() {
                            fs.invoke("exists", self.fontsFolderPath).then(function(exists){
                                if (exists) {
                                    deferred.resolve(self);
                                } else {
                                    deferred.reject("Cannot initialize the PDF fonts cache: cache path does not exist!");
                                }
                            });
                        });
                    });
                } else {
                    deferred.reject("Cannot initialize the PDF Object cache: invalid document path!");
                }
            } else {
                deferred.reject("The PDF object cache can only be set when running under Lumieres!");
            }

            return deferred.promise;
        }
    },

    writeToDisk: {
        enumerable: false,
        value:     function(filePath, bytes) {
            var self = this;

            return self.backend.get("fs").invoke("open", filePath, "wb").then(function(writer) {
                var offset = 0,
                    remaining = bytes.length;

                var writeNextChunk = function() {
                    if (remaining > 0) {
                        var chunks = [],
                            k;

                        for (k = 0; k < 1 && remaining > 0; k ++) {
                            var chunckLength = Math.min(256 * 1024, remaining),
                                chunkData,
                                i, j;

                            if (typeof bytes.subarray === "function") {
                                chunkData = bytes.subarray(offset, offset + chunckLength);
                            } else if (typeof bytes.slice === "function") {
                                chunkData = bytes.slice(offset, offset + chunckLength);
                            } else {
                                chunkData = [];
                                for (i = 0, j = offset; i < chunckLength; i ++, j ++) {
                                    chunkData[i]  = bytes[j];
                                }
                            }
                            chunks.push(writer.write(bytesArrayToArray(chunkData), "binary"));

                            offset += chunckLength;
                            remaining -= chunckLength;
                        }

//                        return Promise.all(chunks).then(writeNextChunk);
                        return chunks[0].then(writeNextChunk, function(error) {
                            writer.close();
                            return error;
                        });
                    } else {
                        // We must close the file to release the file descriptor and writer
                        writer.close();
                    }
                };

                return writeNextChunk();
            });
        }
    },

    setObject: {
        value: function (data, page, callback) {
            var self = this,
                name = data[0],
                // pageNbr = data[1] + 1,
                type = data[2],
                objectData = data[3],
                referenceID = data[4],
                hasMask = data[5],
                filePath = this.assetsFolderPath + "image_" + (referenceID ? referenceID.num + "_" + referenceID.gen : name),
                bytes,
                length;

//            console.log(">>> CACHE SET OBJECT", name, pageNbr, type, typeof data[3], data[3].length, data[4]);
//            console.log(">>> ID:", page.objs.resolve(data[0]))

            self.log("setObject", name, type)

            switch (type) {
            case "JpegStream":
                filePath += ".jpeg";

                length = objectData.length;
                bytes = new Uint8Array(length);

                for (var i = 0; i < length; i ++) {
                    bytes[i] = objectData.charCodeAt(i);
                }
                break;

            case "Image":
                var width = objectData.width,
                    height = objectData.height,
                    imageCanvas = createScratchCanvas(width, height);

                if (typeof ImageData !== 'undefined' && objectData instanceof ImageData) {
                    imageCanvas.putImageData(objectData, 0, 0);
                } else {
                    if (objectData.data) {
                        putBinaryImageData(imageCanvas.getContext('2d'), objectData.data, width, height);
                        if (hasMask) {
                            hasMask = checkForTransparency(objectData.data);
                        }
                    } else {
                        // JFD TODO: this is likely to be a mask which we do not yet support, just ignore for now...
                        break;
                    }
                }
                filePath += hasMask ? ".png" : ".jpeg";
                bytes = bytesFromDataURL(imageCanvas.toDataURL(hasMask ? "image/png" :"image/jpeg", PDFJS.jpegQuality));
                break;
            }

            if (bytes) {
                var url;

                self.writeToDisk(filePath, bytes).then(function() {
                    url = encodeURI("fs://localhost" + filePath);
                }, function(error) {
                    if (error instanceof Error) {
                        console.warn("Cannot save image to disk:", error.message, error.stack);
                    } else {
                        console.warn("Cannot save image to disk:", error);
                    }
                }).done(function() {
                    self.log("objectWritten", url);
                    callback(url);
                });
            } else {
                callback();
            }
        }
    },

    setFonts: {
        value: function(fonts, callback) {
            var self = this,
                nbrFonts = fonts ? fonts.length : 0;

            var writeFontToDisk = function(fontIndex) {
                var font = fonts[fontIndex],
                    fontName = font.name,
                    filePath,
                    fontURL,
                    fs = self.backend.get("fs");

                // rename partial font to avoid potential name conflict
                if (fontName.length > 7 && fontName.charAt(6) === "+") {
                    fontName = font.loadedName.substr(2) + fontName.substr(6);
                }
                filePath = self.fontsFolderPath + fontName + ".otf";
                fontURL = encodeURI("fs://localhost" + filePath);

                return fs.invoke("exists", filePath).then(function(exists) {
                    if (!exists) {
                        return self.writeToDisk(filePath, font.data).then(function() {
                            font.url = fontURL;
                            self.log("fontWritten", fontURL)
                            if (++ fontIndex < nbrFonts) {
                                return writeFontToDisk(fontIndex);
                            }
                        });
                    } else {
                        font.url = fontURL;
                        if (++ fontIndex < nbrFonts) {
                            return writeFontToDisk(fontIndex);
                        }
                    }
                });
            };

            self.log("setFonts")
            writeFontToDisk(0).then(function() {
                if (callback) {
                    callback();
                }
            }, function(error) {
                console.warn("Error saving font:", error.message);
                if (callback) {
                    callback();
                }
            }).done();
        }
    },


    _checkFile: {
        value: function(filePath) {
            var self = this,
                fs = self.backend.get("fs");

            return fs.invoke("stat", filePath).then(function(stats) {
                return (stats && stats.size > 0);
            }, function(e) {
                return (false);
            });
        }
    },

    objectUrl: {
        value: function(data, page, callback) {
            var self = this,
                name = data[0],
                type = data[2],
                referenceID = data[3],
                hasMask = data[4],
                filePath = this.assetsFolderPath + "image_" + (referenceID ? referenceID.num + "_" + referenceID.gen : name),
                url = null;

//            console.log(">>> CACHE GET OBJECT URL:", filePath, type);
            switch (type) {
                case "JpegStream":
                    filePath += hasMask ? ".png" : ".jpeg";
                    break;
                case "Image":
                    filePath += hasMask ? ".png" : ".jpeg";
                    break;
            }

            this._checkFile(filePath).then(function(valid) {
                self.log("getObject", filePath, valid)
                if (valid) {
                    url = encodeURI("fs://localhost" + filePath);
                } else {
                    if (hasMask) {
                        // check for a jpeg version of the image
                        filePath = filePath.substr(0, filePath.length - 4) + ".jpeg";
                        return self._checkFile(filePath).then(function(valid) {
                            if (valid) {
                                url = encodeURI("fs://localhost" + filePath);
                            }
                        });
                    }
                }
            }).done(function() {
                callback(url);
            });
        }
    }
});


