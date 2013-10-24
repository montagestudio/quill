/*jshint camelcase:false, maxcomplexity:16 */ // TODO: fix these warnings
var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    ImportExtension = require("core/ImportExtension").ImportExtension;


var g_validLicense = null;      // Null = need to check the license, true = licence ok, false = invalid license

var g_TrialPeriod = 10;     //in days

var g_local_secret_hash_key =  "e9161e517f3db0bed9ecf45f634f1f25";
var g_remote_secret_hash_key = "cdc1421b4468131ec9411b8522b1df61";


var _storeExpirationDate = function(scholastic, expiration) {
    expiration = expiration.getTime().toString(16);

    return scholastic.invoke("random", 4).then(function(salt) {
        return scholastic.invoke("hash", salt + g_local_secret_hash_key + expiration).then(function(hash) {
            var encodedData =  salt + hash.substr(0, 13) + expiration + hash.substr(13);
            return scholastic.invoke("exec", 'defaults write -g NSPowerMgrOptions "' + encodedData + '"');
        });
    });
};

var _checkLicense = function(scholastic) {
    scholastic.invoke("exec", "defaults read -g NSPowerMgrOptions").then(function(response) {
        response = response.trim();

        // Check if the date is valid
        var salt = response.substr(0, 8),
            hash = response.substr(8, 13) + response.substr(13-32),
            expiration = response.substr(8+13, response.length - (8+32));

        return scholastic.invoke("hash", salt + g_local_secret_hash_key + expiration).then(function(value) {
            if (hash === value) {
                expiration = new Date(parseInt(expiration, 16));
                console.log("LOCAL EXPIRATION:", expiration)
                g_validLicense = expiration > new Date();

                // Tricky user might change their computer time, we will check it against the date from
                // the HTTP request when we retrieve the actual expiration date from our server

                var url = "https://updates.declarativ.com/plume/builds/";
                url += "?u=scholastic&v=" + lumieres.buildVersion + "&t=" + new Date().getTime();

                // do not return the promise from the fetchData call as we don't want to block the initialization for that,
                // it's gonna be async
                scholastic.invoke("fetchData", url, true).then(function(response) {
                    var currentDate = response.headers.date;

                    if (currentDate) {
                        currentDate = new Date(currentDate);
                    } else {
                        currentDate = new Date();
                    }

                    // Decode and verify the data received from the server
                    var data = response.data.trim(),
                        salt = data.substr(0, 8),
                        hash = data.substr(8, 11) + data.substr(11-32),
                        expiration = data.substr(8+11, data.length - (8+32));

                    return scholastic.invoke("hash", salt + g_remote_secret_hash_key + expiration).then(function(value) {
                        if (hash === value) {
                            expiration = new Date(parseInt(expiration, 16) * 1000);

                            if (expiration - currentDate < 0) {
                                g_validLicense = false;
                                _reportInvalidLicense();
                            }

                            return _storeExpirationDate(scholastic, expiration).then(function() {
                                console.log("REMOTE EXPIRATION:", expiration)
                            });
                        }
                    });

                }, function(error) {
                    console.log("#ERROR:", error.stack)
                }).done();

            } else {
                console.log("INVALID HASH", hash, value);
                g_validLicense = false;
            }
        });
    }, function() {
        // We do not have a date saved locally. Let's write an expiration date 10 days from now
        var expiration = new Date();

        expiration.setDate(expiration.getDate() + g_TrialPeriod);
        return _storeExpirationDate(scholastic, expiration).then(function() {
            g_validLicense = true;
        })
    }).done(function() {
        console.log("Done checking license validity =", g_validLicense);

        if (g_validLicense !== true) {
            _reportInvalidLicense();
        }
    });
};

var _invalidLicenseReported = false;
var _reportInvalidLicense = function() {
    if (!_invalidLicenseReported) {
        // JFD TODO: Rewrite me properly
        alert("Your copy of Plume has expired!\nYou won't be able to import document.");
        _invalidLicenseReported = true;
    }
};

exports.ScholasticExtension = Montage.create(ImportExtension, {
    initialize: {
        value: function(backend) {
            // check the expiration date, if needed set a new expiration date 10 days from now. Later one we will retrieve the actual expiration date from our server
            var scholastic = backend.get("scholastic"),
                checkLicense = function() {
                    _checkLicense(backend.get("scholastic"));
                };

            // In case the computer is offline, let setup a listener to do the check as soon the computer come online
            window.addEventListener("online", checkLicense, false);

            // check the license every hours
            setInterval(checkLicense, 1000 * 3600);

            // Check the license now
            checkLicense();
        }
    },

    canPerformOperation: {
        value: function(backend, operation, params) {
            var deferred = Promise.defer();

            if (g_validLicense === null) {
                // We need to wait we are done checking the license
                var checkInterval;

                _checkValidityPerformed = function() {
                    if (g_validLicense !== null) {
                        deferred.resolve(g_validLicense);
                        clearInterval(checkInterval);
                    }
                }

                checkInterval = setInterval(_checkValidityPerformed, 200);
            } else {
                deferred.resolve(g_validLicense);
            }

            return deferred.promise;
        }
    },


    getMetaData: {
        value: function(backend, item) {
            var deferred = Promise.defer();

            backend.get("scholastic").invoke("getISBNFromFile", item.url).then(function(isbn) {
                if (isbn) {
                    item.isbn = isbn;

                    return backend.get("scholastic").invoke("fetchMetaData", isbn).then(function(response) {
                        var parser = new DOMParser(),
                            xmlDoc,
                            data;

                        try {
                            xmlDoc = parser.parseFromString(response, "text/xml");

                            // Encapsulated XML
                            var wddxPacket = xmlDoc.getElementsByTagName("wddxPacket");
                            if (wddxPacket && wddxPacket.length) {
                                data = wddxPacket[0].getElementsByTagName("string");
                                if (data && data.length) {
                                    xmlDoc = parser.parseFromString(data[0].textContent, "text/xml");
                                }
                            }

                            var rootNodes = xmlDoc.getElementsByTagName("XPSMetadata"),
                                nodes = rootNodes ? rootNodes[0].childNodes : [],
                                nbrNodes = nodes.length,
                                i,
                                metadata = {};

                            var scholasticNameToQuillName = {
                                "contributor_Statement": "document-author",
                                "isbn_13": "book-id",
                                "language": "document-language",
                                "publisher": "document-publisher",
                                "title": "document-title",
                                "eReader_Category_Output": "document-type"

                                // JFD TODO: add more names as needed
                            };

                            for (i = 0; i < nbrNodes; i ++) {
                                var node = nodes[i],
                                    name = scholasticNameToQuillName[node.nodeName] || node.nodeName,
                                    value = node.textContent;

                                // Convert string to int or float
                                if (/\d/.test(value) && /^[+-]?\d*\.?\d*$/.test(value)) {
                                    value = parseFloat(value);
                                }

                                if (metadata[name] === undefined) {
                                    metadata[name] = value;
                                } else {
                                    if (metadata[name] instanceof Array) {
                                        metadata[name].push(value);
                                    } else {
                                        metadata[name] = [metadata[name], value];
                                    }
                                }
                            }

                            deferred.resolve({id: item.id, metadata: metadata});
                        } catch(error) {
                            console.log("ERROR:", error);
                            deferred.reject({id: item.id, error: error});
                        }
                    }, function(error) {
                        deferred.reject({id: item.id, error: error});
                    });
                } else {
                    deferred.resolve({id: item.id});
                }
            }, function(error) {
//                deferred.reject({id: item.id, error: error});
                // JFD TODO: for now, if you try to convert a file that is not a typical scholastic filename, let's just ignore the metadata
                deferred.resolve({id: item.id});
            }).done();

            return deferred.promise;
        }
    },

    customizePages: {
        value: function(backend, item) {
            var deferred = Promise.defer();

            console.log("*** customizePages", item);

            // Let's add a copyright banner
            this.addCopyrightBanner(backend, item).then(function(success) {
                // Let's setup a cover image
                backend.get("scholastic").invoke("setupCoverPage", item).then(function(success) {
                    deferred.resolve(item.id);
                }, function(error) {
                    deferred.reject(error);
                });
            }, function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        }
    },

    customizeAssets: {
        value: function(backend, item) {
            var deferred = Promise.defer();

            console.log("*** customizeAssets");
            // JFD TODO: write me

            deferred.resolve(item.id);
            return deferred.promise;
        }
    },

    customizeEbook: {
        value: function(backend, item) {
            var deferred = Promise.defer();

            console.log("*** customizeEbook");
            // JFD TODO: write me

            deferred.resolve(item.id);
            return deferred.promise;
        }
    },

    addCopyrightBanner: {
        value: function(backend, item) {
            var self = this,
                deferred = Promise.defer();

            var toc = item.meta.toc,
                copyrightPageNbr = 0;

            if (toc) {
                toc.some(function(entry) {
                    if (entry.title === "_copyright") {
                        copyrightPageNbr = entry.pageNumber;
                        return true;
                    }
                    return false;
                });
            }

            if (copyrightPageNbr) {
                var pageURL = item.destination + "/OEBPS/pages/" + copyrightPageNbr + ".xhtml",
                    bannerURL = "http://client/assets/scholastic/copyright-banner.html",
                    page,
                    banner;

                this._getDocumentForURL(pageURL).then(function(result) {
                    // Make sure we don't have already a copyright banner in that page
                    if (result.document.getElementById("scholastic-e-copyright")) {
                        return;
                    }
                    page = result;
                    return self._getDocumentForURL(bannerURL).then(function(result) {
                        banner = result;
                    });
                }, function(error) {
                    deferred.reject(error);
                }).done(function() {
                    if (page && banner) {
                        var pageElem =  document.createElement("div"),
                            bannerElem = document.createElement("div"),
                            pageMetrics,
                            bannerVerticalHeight, bannerHorizontalHeight,
                            horizontalSpaces, verticalSpaces,
                            bannerStyle,
                            bannerPosition;

                        // Inject the page main element inside the current document in order to get some metrics
                        Array.prototype.forEach.call(page.document.getElementsByTagName("body")[0].childNodes, function(node) {
                            pageElem.appendChild(node.cloneNode(true));
                        });
                        document.body.appendChild(pageElem);

                        // Inject the banner element inside the current document in order to get some metrics
                        // JFD TODO: for some reason, banner is not a real document element, cannot uses it's node as HTML nodes!
                        bannerElem.innerHTML = banner.text;
                        document.body.appendChild(bannerElem);

                        // Now, analyze the page to find out where we have enough space
                        pageMetrics = pageElem.getElementsByTagName("div")[0].getBoundingClientRect();

                        bannerElem.style.position = "relative";
                        bannerElem.style.width = pageMetrics.width + "px";
                        bannerHorizontalHeight = bannerElem.getElementsByClassName("copyright-banner")[0].getBoundingClientRect().height + 20;
                        bannerElem.style.width = pageMetrics.height + "px";
                        bannerVerticalHeight = bannerElem.getElementsByClassName("copyright-banner")[0].getBoundingClientRect().height + 20;

                        verticalSpaces = self._getSpaces(pageElem, bannerHorizontalHeight, false) || [];
                        horizontalSpaces = self._getSpaces(pageElem, bannerVerticalHeight, true) || [];

                        // Let's figure out where we want to put the banner on the page
                        if (verticalSpaces.length && pageMetrics.bottom - verticalSpaces[verticalSpaces.length - 1].end >= bannerHorizontalHeight) {
                            bannerPosition = "bottom";
                        } else if (verticalSpaces.length && verticalSpaces[0].start - pageMetrics.top >= bannerHorizontalHeight){
                            bannerPosition = "top";
                        } else if (verticalSpaces.length) {
                            var spaces = [
                                    horizontalSpaces[0].start - pageMetrics.left,
                                    pageMetrics.right - horizontalSpaces[horizontalSpaces.length - 1].end
                                ];

                            if (spaces[copyrightPageNbr % 2] >= bannerVerticalHeight) {
                                if (copyrightPageNbr % 2) {
                                    bannerPosition = "right";
                                } else {
                                    bannerPosition = "left";
                                }
                            } else if (spaces[(copyrightPageNbr + 1) % 2] >= bannerVerticalHeight) {
                                if (copyrightPageNbr % 2) {
                                    bannerPosition = "left";
                                } else {
                                    bannerPosition = "right";
                                }
                            } else {
                                for (var i = verticalSpaces.length - 1; i >= 1; i --) {
                                    if (verticalSpaces[i].start - verticalSpaces[i - 1].end >= bannerHorizontalHeight) {
                                        bannerPosition = "middle";
                                        bannerStyle = "top:" + horizontalSpaces[i].start - bannerHorizontalHeight + "px";
                                        break;
                                    }
                                }
                            }
                        }

                        if (!bannerPosition) {
                            // if we haven't find a good location for the banner, let's just put it at the bottom
                            bannerPosition = "bottom";
                        }

                        // Insert the banner into the page
                        var pos = page.text.lastIndexOf("</svg>"),
                            serializer = new XMLSerializer(),
                            bannerData = serializer.serializeToString(bannerElem.getElementsByTagName("div")[0]),
                            data;

                        if (pos) {
                            pos += "</svg>".length;
                            data = page.text.substring(0, pos) + "\n";

                            bannerData = bannerData.replace(/{{height}}/g, pageMetrics.height);
                            bannerData = bannerData.replace(/{{position}}/g, bannerPosition);
                            bannerData = bannerData.replace(/{{style}}/g, bannerStyle);
                            bannerData = bannerData.replace(/{{isbn}}/g, item.isbn || "0000000000000");
                            data += bannerData;

                            data += page.text.substring(pos);
                        } else {
                            deferred.resolve(false);
                        }

                        // Rewrite the page now...
                        backend.get("fs").invoke("write", pageURL.substring("fs://localhost".length), data).then(function() {
                            deferred.resolve(true);
                        }, function(error) {
                            deferred.reject(error);
                        }).done(function() {
                            // Remove the added nodes now that we are done with them
                            pageElem.parentNode.removeChild(pageElem);
                            bannerElem.parentNode.removeChild(bannerElem);
                        });
                    } else {
                        deferred.resolve(false);
                    }
                });
            } else {
                deferred.resolve();
            }

            return deferred.promise;
        }
    },

    _getDocumentForURL: {
        value: function(url) {
            var deferred = Promise.defer(),
                xhr = new XMLHttpRequest();

            xhr.open('GET', url, true);
            xhr.onload = function(e) {
                if (Math.floor(this.status / 100) === 2) {
                    if (this.responseXML) {
                        deferred.resolve({text: this.responseText, document: this.responseXML});
                    } else {
                        var parser = new DOMParser();
                        deferred.resolve({text: this.response, document: parser.parseFromString(this.response, "text/xml")});
                    }
                } else {
                    deferred.reject("cannot load " + url);
                }
            };

            xhr.onerror = function(e) {
                deferred.reject(e);
            };

            xhr.send();

            return deferred.promise;
        }
    },

    _getSpaces: {
        value: function(parentElement, minDistance, isHorizontal) {
            var start = "top",
                end = "bottom",
                parentMetrics = parentElement.getBoundingClientRect(),
                boxes = [],
                spaces = [],
                previous = null;

            var _intersect = function (a, b) {
                return (a.left <= b.right &&
                      b.left <= a.right &&
                      a.top <= b.bottom &&
                      b.top <= a.bottom);
            };

            var _walkNodes = function(parentNode) {
                Array.prototype.forEach.call(parentNode.childNodes, function(elem) {
                    if (elem.nodeValue || (elem.childElementCount === 0 && elem.textContent)) {
                        var value = (elem.nodeValue || elem.textContent || "").replace(/^\s+|\s+$/g,''),     // trim whiteSpace
                            box = null;

                        if (value.length) {
                            if (elem.getBoundingClientRect) {
                                box = elem.getBoundingClientRect();
                            } else {
                                if (elem.parentNode.getBoundingClientRect) {
                                    box = elem.parentNode.getBoundingClientRect();
                                }// else {
                                    // JFD TODO: write me. Need to find the position of a lone text node
                                // }
                            }
                            // Make sure the node intersect with the parent element
                            if (box && _intersect(box, parentMetrics)) {
                                boxes.push(box);
                            }
                        }
                    }

                    if (elem.childElementCount) {
                        _walkNodes(elem);
                    }
                });
            };


            if (isHorizontal === true) {
                start = "left";
                end = "right";
            }

            _walkNodes(parentElement);

            boxes = boxes.sort(function(a, b) {
                if (a[start] < b[start]) {
                    return -1;
                } else if (a[start] === b[start]) {
                    return (a[end] - b[end]);
                } else {
                    return 1;
                }
            });

            boxes.forEach(function(box) {
                var startValue = Math.floor(box[start]),
                    endValue = Math.ceil(box[end]);

                if (previous) {
                    if ((previous.end + minDistance) >= startValue) {
                        if (previous.end < endValue) {
                            previous.end = endValue;
                        }
                        return;
                    }
                }
                previous = {
                    start: startValue,
                    end: endValue
                };
                spaces.push(previous);
            });

            return spaces;
        }
    }
});

