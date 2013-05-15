var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    adaptConnection = require("q-connection/adapt"),
    Connection = require("q-connection");


var IS_IN_LUMIERES = (typeof lumieres !== "undefined");

function putBinaryImageData(ctx, data, w, h) {
  var tmpImgData = 'createImageData' in ctx ? ctx.createImageData(w, h) :
    ctx.getImageData(0, 0, w, h);

  var tmpImgDataPixels = tmpImgData.data;
  if ('set' in tmpImgDataPixels)
    tmpImgDataPixels.set(data);
  else {
    // Copy over the imageData pixel by pixel.
    for (var i = 0, ii = tmpImgDataPixels.length; i < ii; i++)
      tmpImgDataPixels[i] = data[i];
  }

  ctx.putImageData(tmpImgData, 0, 0);
}

function bytesFromDataURL(dataURL) {
  // convert base64 to raw binary data held in a string
  // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
  var byteString = atob(dataURL.split(',')[1]);

  // separate out the mime component
  var mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0]

  // write the bytes of the string to an Uint8Array
  var length = byteString.length,
       bytes = new Uint8Array(length);

  for (var i = 0; i < length; i ++) {
      bytes[i] = byteString.charCodeAt(i);
  }

  return bytes;
}


exports.PDF2HTMLCache = Montage.create(Montage, {

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

    folderPath: {
        value: null
    },

    initialize: {
        value: function(path, pdf) {
            var thisRef = this,
                defered = Promise.defer();

            console.log(">>> SETUP CACHE FOR", path, pdf.pdfInfo.fingerprint);


            if (IS_IN_LUMIERES) {
                if (path.indexOf("fs://localhost") === 0) {
                    var fs = thisRef.backend.get("fs");

                    thisRef.folderPath = path.substring(14) + ".plume/assets";

                    fs.invoke("exists", this.folderPath).then(function(exists){
                        console.log("....exists....", exists);
                        var createFolderPromise;
                        if (!exists) {
                            createFolderPromise = fs.invoke("makeTree", thisRef.folderPath, "777");
                        } else {
                            createFolderPromise = Promise.resolve();
                        }

                        createFolderPromise.then(function() {
                            defered.resolve(thisRef)
                        }, function(error) {
                            defered.reject("Cannot initialize the PDF Object cache: cannot create folder,", error);
                        });
                    })
                } else {
                    defered.reject("Cannot initialize the PDF Object cache: invalid document path!");
                }
            } else {
                defered.reject("The PDF object cache can only be set when running under Lumieres!")
            }

            return defered.promise;
        }
    },

    setObject: {
        value: function(data, page, callback) {
            var thisRef = this,
                name = data[0],
                pageNbr = data[1] + 1,
                type = data[2],
                imageData = data[3],
                referenceID = data[4],
                filePath = this.folderPath + "/image_" + (referenceID ? referenceID.num + "_" + referenceID.gen : name),
                bytes,
                length;

            var writeToDisk = function(filePath, bytes) {
                console.log("===== writeToDisk[1]", filePath, bytes.length)
                return thisRef.backend.get("fs").invoke("open", filePath, "wb", "").then(function(writer) {
                    var offset = 0,
                        remaining = bytes.length;

                    var writeNextChunk = function() {
                        if (remaining > 0) {
                            var chunks = [],
                                k;

                            for (k = 0; k < 3 && remaining > 0; k ++) {
                                var chunckLength = Math.min(256 * 1024, remaining),
                                    chunkData = [],
                                    i, j;
                                for (i = 0, j = offset; i < chunckLength; i ++, j ++) {
                                    chunkData[i]  = bytes[j];
                                }

                                console.log("    ===== writeToDisk[2]:", offset, chunkData.length);
                                chunks.push(writer.write(chunkData));

                                offset += chunckLength;
                                remaining -= chunckLength;

                            }
                            return Promise.all(chunks).then(writeNextChunk);
                        } else {
                            return;
                        }
                    }

//                    while (remaining > 0) {
//                        var chunckLength = Math.min(512 * 1024, remaining),
//                            chunkData = [],
//                            i, j;
//
//                        for (i = 0, j = offset; i < chunckLength; i ++, j ++) {
//                            chunkData[i]  = bytes[j];
//                        }
//                        console.log("    ===== writeToDisk[2]:", offset, chunkData.length);
//                        chuncks.push(writer.write(chunkData));
//
//                        offset += chunckLength;
//                        remaining -= chunckLength;
//                    }
//                    return Promise.all(chuncks);

                    return writeNextChunk();
                });
            };

            if (PDFJS.useExternalDiskCache) {
                console.log(">>> CACHE SET OBJECT", name, pageNbr, type, typeof data[3], data[3].length, data[4]);
    //            console.log(">>> ID:", page.objs.resolve(data[0]))
                switch (type) {
                    case "JpegStream":
                        filePath += ".jpeg";

                        length = imageData.length;
                        bytes = new Uint8Array(length);

                        for (var i = 0; i < length; i ++) {
                            bytes[i] = imageData.charCodeAt(i);
                        }
                        break;

                    case "Image":
                        var width = imageData.width,
                            height = imageData.height,
                            imageCanvas = createScratchCanvas(width, height);

                        filePath += ".jpeg";

                        console.log("...imageData", imageData)
                        if (typeof ImageData !== 'undefined' && imageData instanceof ImageData) {
                            imageCanvas.putImageData(imageData, 0, 0);
                        } else {
                            putBinaryImageData(imageCanvas.getContext('2d'), imageData.data, width, height);
                        }

                        // JFD TODO: check if image requires the alpha channel!
                        bytes = bytesFromDataURL(imageCanvas.toDataURL("image/jpeg"));
                        console.log("...bytes", bytes)

                        break;
                }
            }

            if (bytes) {
                writeToDisk(filePath, bytes).then(function() {
                    callback("fs://localhost" + filePath);
                }).fail(function(error) {
                    if (error instanceof Error) {
                        console.warn("Cannot save image to disk:", error.message, error.stack);
                    } else {
                        console.warn("Cannot save image to disk:", error);
                    }
                    callback();
                });
            } else {
                callback();
            }
        }
    },

    objectUrl: {
        value: function(data, page, callback) {
            var thisRef = this,
                fs = thisRef.backend.get("fs"),
                name = data[0],
                type = data[2],
                referenceID = data[3],
                filePath = this.folderPath + "/image_" + (referenceID ? referenceID.num + "_" + referenceID.gen : name);

            console.log(">>> CACHE GET OBJECT URL:", filePath, type);

            switch (type) {
                case "JpegStream": filePath += ".jpeg";     break;
                case "Image": filePath += ".jpeg";           break;
            }

            fs.invoke("exists", filePath).then(function(exists) {
                callback(exists ? "fs://localhost" + filePath : null);
            }, function(error) {
                callback(null);
            });
        }
    }
});


