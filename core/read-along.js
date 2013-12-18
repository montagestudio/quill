var Montage = require("montage").Montage,
    Promise = require("montage/core/promise").Promise,
    ReadingOrder = require("core/reading-order").ReadingOrder,
    Q = require("q"),
    Queue = require("q/queue"),
    Connection = require("q-connection"),
    AudioAlignment = require("backend_plugins/audio-alignment").AudioAlignment;

/**
 * This controls the read aloud feature of an ebook page.
 */

var RAW_EXTENSION = ".raw",
    WAV_EXTENSION = ".wav",
    MP3_EXTENSION = ".mp3";


/**
 * https://github.com/kriskowal/q-connection/blob/master/spec/q-connection-spec.js
 */


exports.ReadAlong = Montage.specialize({

    constructor: {
        value: function ReadAlong() {

            this.useWorkaroundForCORSErrorWhenConnectingToIframe = true;

            this._readingOrder = new ReadingOrder();

            return this.super();
        }
    },

    _pageNumber: {
        value: null
    },

    _basePath: {
        value: null
    },

    basePath: {
        get: function() {
            return this._basePath;
        },
        set: function(value) {
            if (value && value !== this._basePath) {
                this._basePath = value;
            }
        }
    },
    /**
     * The URL of the document that houses the content for this page
     */
    _xhtmlUrl: {
        value: null
    },
    xhtmlUrl: {
        get: function() {
            return this._xhtmlUrl;
        },
        set: function(value) {
            if (value && value !== this._xhtmlUrl) {
                this._xhtmlUrl = value;

                var pageNumber = value.substring(value.lastIndexOf("/") + 1).replace(".xhtml", "");
                this._pageNumber = pageNumber;
                this.readingOrder._pageNumber = pageNumber;

                var sourcePath = value.substring(0, value.lastIndexOf("/")).replace("/pages", "");
                this._basePath = sourcePath;

                if (!this.audioAlignment) {
                    this.audioAlignment = new AudioAlignment();
                    this.audioAlignment.initialize(sourcePath, pageNumber);
                    this.audioAlignment.audioFile = this.finalAudioUrl;
                }

                if (!this.finalAudio) {
                    var audioElementForThisPage = document.getElementById("audio" + this._pageNumber);
                    if (!audioElementForThisPage) {
                        audioElementForThisPage = document.createElement("audio");
                        audioElementForThisPage.id = "audio" + this._pageNumber;
                        document.body.appendChild(audioElementForThisPage);
                        audioElementForThisPage.addEventListener('ended', function(target) {
                            console.log("Audio is done playing", target);
                        });
                    }
                    if (!audioElementForThisPage.src) {
                        audioElementForThisPage.src = this.finalAudioUrl;
                    }
                    this.finalAudio = audioElementForThisPage;

                }
            }
        }
    },

    /**
     * The URL or the voice only audio for this page, used for alignment
     */

    voiceAudio: {
        value: null
    },

    _voiceAudioUrl: {
        value: null
    },

    voiceAudioUrl: {
        get: function() {
            var url = this._voiceAudioUrl;

            if (!url && this._basePath && this._pageNumber) {
                url = this._basePath + "/voice/" + this._pageNumber + RAW_EXTENSION;
            }

            return url;
        },
        set: function(value) {
            if (value && value !== this._voiceAudioUrl) {
                this._voiceAudioUrl = value;
            }
        }
    },

    /**
     * The URL of the final audio which contains music, foley effects and voice for this page, packaged with the final book
     */

    finalAudio: {
        value: null
    },

    _finalAudioUrl: {
        value: null
    },

    finalAudioUrl: {
        get: function() {
            var url = this._finalAudioUrl;

            if (!url && this._basePath && this._pageNumber) {
                url = this._basePath + "/audio/" + this._pageNumber + WAV_EXTENSION;
            }

            return url;
        },
        set: function(value) {
            if (value && value !== this._finalAudioUrl) {
                this._finalAudioUrl = value;
            }
        }
    },

    playReadAloud: {
        value: function() {
            if (!this.finalAudioUrl || !this.finalAudio) {
                console.log("No audio for " + this._pageNumber);
                return;
            }
            var readingOrderToDraw;
            var guesses = this.alignmentResults[this.alignmentResults.length - 1].alignmentResults[0].guesses;
            var bestGuessInTermsOfRecall;
            var bestGuessInTermsOfPrecision;

            for (var g in guesses) {
                if (guesses.hasOwnProperty(g)) {
                    var guess = guesses[g];

                    if (guess.readingOrder) {
                        if (!bestGuessInTermsOfRecall || guess.recall > bestGuessInTermsOfRecall.recall) {
                            bestGuessInTermsOfRecall = guess;
                        }
                        if (!bestGuessInTermsOfPrecision || guess.precision > bestGuessInTermsOfRecall.precision) {
                            bestGuessInTermsOfPrecision = guess;
                        }
                    }
                }
            }
            readingOrderToDraw = bestGuessInTermsOfRecall.readingOrder;
            console.log("Playing read along guess #" + bestGuessInTermsOfRecall.rank, readingOrderToDraw);
            var selfPageDocument = this.pageDocument;
            var timeUpdateFunction = function() {
                /*
                For each word in the reading order, add events to the audio to turn on and off the css.
                 */
                // console.log(this.currentTime);
                if (!readingOrderToDraw) {
                    return;
                }
                for (var i = 0; i < readingOrderToDraw.length; i++) {
                    if (this.currentTime > readingOrderToDraw[i].startTime - 0.15 && this.currentTime < readingOrderToDraw[i].endTime) {
                        selfPageDocument.askIframeToAddClassList({
                            classNames: "-epub-media-overlay-active",
                            elementId: readingOrderToDraw[i].id,
                            text: readingOrderToDraw[i].text
                        });
                        // console.log("Requested Highlighting " + readingOrderToDraw[i].text);
                    } else {
                        selfPageDocument.askIframeToRemoveClassList({
                            classNames: "-epub-media-overlay-active",
                            elementId: readingOrderToDraw[i].id,
                            text: readingOrderToDraw[i].text
                        });
                        // console.log("Requested Removed Highlighting from " + readingOrderToDraw[i].text);
                    }
                }
            };
            this.finalAudio.removeEventListener("timeupdate", timeUpdateFunction);
            this.finalAudio.addEventListener("timeupdate", timeUpdateFunction);


            this.finalAudio.addEventListener('ended', function(target) {
                console.log("Removing all highlights, audio is done playing", target);
                if (!readingOrderToDraw) {
                    return;
                }
                for (var i = 0; i < readingOrderToDraw.length; i++) {
                    selfPageDocument.askIframeToRemoveClassList({
                        classNames: "-epub-media-overlay-active",
                        elementId: readingOrderToDraw[i].id,
                        text: readingOrderToDraw[i].text
                    });
                    // console.log("Requested Removed Highlighting from " + readingOrderToDraw[i].text);
                }
            });

            //TODO seek to the beginning or resume...

            this.finalAudio.play();
            // var hit = this.pageDocument.getReadingOrder;
            // console.log("getReadingOrder", hit);
        }
    },

    handleAction: {
        value: function() {
            this.playAudio();
        }
    },

    audioAlignment: {
        value: null
    },

    alignAudioAndText: {
        value: function() {
            console.log("Aligning");
        }
    },

    _alignmentConfidence: {
        value: null
    },

    alignmentConfidence: {
        get: function() {
            if (!this._hasReadAlong) {
                return null;
            }
            //TODO measure confidence in alignment
            return 100;
        }
    },

    /*
    Holder array for aligner's results. 
     */
    alignmentResults: {
        value: null
    },

    load: {
        value: function() {
            console.log("loading prevous read along details");
            return new Promise();
        }
    },

    save: {
        value: function() {
            if (!this.alignmentResults) {
                return;
            }
            console.log("saving prevous read along details" + JSON.stringify(this.alignmentResults));
            return new Promise();
        }
    },

    channel: {
        value: null
    },

    peers: {
        value: null
    },

    hasReadAlong: {
        value: null
    },

    sharedReadingOrderMethods: {
        value: null
    },

    _readingOrder: {
        value: null
    },

    readingOrder: {
        get: function() {
            console.log("get readingOrder", this._readingOrder);

            return this._readingOrder;
        },
        set: function(value) {
            console.log("set readingOrder", value);

            if (value && value !== this._readingOrder) {
                this._readingOrder.contents = value;
            }
        }
    },

    textContent: {
        value: null
    },

    pageDocument: {
        value: null
    },

    connect: {
        value: function() {

            /**
             * https://github.com/kriskowal/q-connection/blob/master/spec/q-connection-spec.js
             */
            var sending = Queue();
            var receiving = Queue();

            var channel = {
                l2r: {
                    get: sending.get,
                    put: receiving.put,
                    close: sending.close,
                    closed: sending.closed
                },
                r2l: {
                    get: receiving.get,
                    put: sending.put,
                    close: receiving.close,
                    closed: receiving.closed
                },
                close: function() {
                    sending.close();
                    receiving.close();
                }
            };

            // To communicate with a single frame on the same origin
            // (multiple frames will require some handshaking event sources)

            var iframe,
                local;

            var iFrames = document.getElementsByTagName("iframe");
            for (var frame = 0; frame < iFrames.length; frame++) {
                if (iFrames[frame].src.indexOf(this._xhtmlUrl) > -1) {
                    console.log(iFrames[frame]);
                    iframe = iFrames[frame];
                }
            }
            if (!iframe) {
                console.log("No connection to the iframe.");
                return;
            }

            /* workaround for Uncaught SecurityError: Blocked a frame with origin "http://client" from accessing a frame with origin "fs://localhost".  The frame requesting access has a protocol of "http", the frame being accessed has a protocol of "fs". Protocols must match.
             */
            try {
                local = iframe.contentWindow.agent.htmlController.sharedReadingOrderMethods;
            } catch (e) {
                console.log("Cant connect to the iframe. " + e);
                local = {};
            }

            this.channel = channel;
            this.peers = {
                local: Connection(channel.l2r, local),
                remote: Connection(channel.r2l, local, {
                    origin: window.location.origin,
                    Q: Q
                }),
                close: channel.close
            };


            var self = this;
            if (!this.useWorkaroundForCORSErrorWhenConnectingToIframe) {
                this.peers.remote.invoke("hasReadAlong").then(function(result) {
                    self.hasReadAlong = result;
                });
                this.peers.remote.invoke("getReadingOrderFromXHTML").then(function(result) {
                    self.this.readingOrder.contents = result;
                });
            } else {
                self.alignmentResults = self.alignmentResults || [];
                var srcUri = this._xhtmlUrl.replace("http://client/index.html?file=", "");
                this.readingOrder.loadFromXHTML(srcUri).then(function(order) {

                    if (self.audioAlignment) {
                        self.audioAlignment.readingOrderJson = order;
                        self.audioAlignment.runAligner({
                            "xhtml": self.xhtmlUrl.replace("fs://localhost", ""),
                            "voice": self.voiceAudioUrl.replace("fs://localhost", ""),
                            "finalAudio": self.finalAudioUrl,
                            "pageNumber": self._pageNumber,
                            "basePath": self.basePath,
                            "readingOrder": order,
                            "text": null
                        }).then(function(alignment) {

                            var alignedAudioFile = alignment.finalAudio;
                            if (alignedAudioFile && alignment.alignmentResults && alignment.alignmentResults[0] && alignment.alignmentResults[0].guesses && alignment.alignmentResults[0].guesses["1"]) {
                                self.alignmentResults.push(alignment);
                                console.log("Alignment returned guesses ", alignment);
                                if (alignedAudioFile.indexOf("/") === 0) {
                                    alignedAudioFile = "fs://localhost" + alignedAudioFile;
                                }
                                // if (!self.finalAudio.src || self.finalAudio.src != alignedAudioFile) {
                                //     self.finalAudio.src = alignedAudioFile;
                                // }
                                self.tryToAutomaticallyPatchTheReadingOrderUsingAudioAlignment(alignment);
                            }
                        });
                    } else {
                        console.warn("Aligner is not on, this is a problem.");
                    }

                    self.readingOrder.text.then(function(result) {
                        console.log("Page content " + result);
                        self.hasReadAlong = result !== "No text detected on this page.";
                        self.textContent = result;
                    });

                });
            }
        }
    },

    tryToAutomaticallyPatchTheReadingOrderUsingAudioAlignment: {
        value: function(alignment) {
            console.log("I'm going to try to guess which hypothesis works for this text, and then try to re-order the reading order to match.");
            var guesses = alignment.alignmentResults[0].guesses;
            var readingOrder = alignment.readingOrder;

            var tightMatches = 0;
            for (var g in guesses) {
                if (guesses.hasOwnProperty(g)) {
                    var guess = guesses[g];

                    /* if the alignment is the same length as the reading order (ie has only <s> and </s> extra) */
                    if (guess.alignment[readingOrder.length + 2] && !guess.alignment[readingOrder.length + 3]) {
                        guess.potentiallyClose = guess.potentiallyClose ? guess.potentiallyClose++ : 1;
                        tightMatches++;
                    }
                }
            }

            // if (!tightMatches && guesses["1"]) {
            //     guesses["1"].potentiallyClose = 1;
            // }

            for (var gu in guesses) {
                if (guesses.hasOwnProperty(gu)) {
                    var guess = guesses[gu];

                    // if (guess.potentiallyClose) {
                    /* If the text is short, then force/fake align it */
                    if (readingOrder && readingOrder.length < 35) {
                        guess = this.fitWordsToAlignmentTimesRegardlessOfText(guess, readingOrder.slice());
                    } else {
                        /* Otherwise, only show words that actually match the audio guesses */
                        guess = this.putElementIdIntoAlignments(guess, readingOrder.slice());
                    }
                    console.log(guess);
                    // }
                }
            }
            this.playReadAloud();
        }
    },

    /*
    This is a very simplistic, if the words are perfectly recognized, and the reading order is perfect,
    the highlights will be nice and sequential (maybe too fast, or two slow, or missing some at the end...)
     */
    fitWordsToAlignmentTimesRegardlessOfText: {
        value: function(guess, readingOrder) {
            var wordsInAudio = guess.alignment;
            var wordsInDomReadingOrder = readingOrder;
            var uniqueWordsInGuess = {};
            var uniqueWordsInReadingOrder = {};

            var precision = 0,
                correspondingIndexInAudio,
                lastIndexInWordsInAudio,
                lastIndexInDomReadingOrder,
                correspondingWordInAudio,
                previousWordEndTime;

            for (var wordIndex = 0; wordIndex < wordsInDomReadingOrder.length; wordIndex++) {
                correspondingIndexInAudio = wordIndex + 1;
                correspondingWordInAudio = wordsInAudio[correspondingIndexInAudio];
                if (!correspondingWordInAudio) {
                    console.log("correspondingIndexInAudio is missing, filling in with rough timings" + correspondingIndexInAudio);
                    if (!previousWordEndTime) {
                        previousWordEndTime = 0;
                    }
                    wordsInDomReadingOrder[wordIndex].audioText = " ";
                    wordsInDomReadingOrder[wordIndex].startTime = previousWordEndTime + 0.01;
                    wordsInDomReadingOrder[wordIndex].endTime = previousWordEndTime + 0.22;
                } else {
                    wordsInDomReadingOrder[wordIndex].audioText = correspondingWordInAudio.text;
                    wordsInDomReadingOrder[wordIndex].startTime = parseFloat(correspondingWordInAudio.start);
                    wordsInDomReadingOrder[wordIndex].endTime = parseFloat(correspondingWordInAudio.end);
                    uniqueWordsInGuess[wordsInDomReadingOrder[wordIndex].audioText] = 1;
                    lastIndexInWordsInAudio = correspondingIndexInAudio;
                }
                /* TODO do a match on vowels to see if it might be a match, instead of just trying it */
                previousWordEndTime = wordsInDomReadingOrder[wordIndex].endTime;
                if (wordsInDomReadingOrder[wordIndex].audioText.trim().toUpperCase().replace(/[^A-Z0-9'-]/g, "") === wordsInDomReadingOrder[wordIndex].text.trim().toUpperCase().replace(/[^A-Z0-9'-]/g, "")) {
                    precision++;
                }
                uniqueWordsInReadingOrder[wordsInDomReadingOrder[wordIndex].text] = 1;

                /* keep track of words that were not matched, either audio was too short, or words in dom were too short */
                lastIndexInDomReadingOrder = wordIndex;
            }
            console.log("Hypothesis " + guess.hypothesis + "; Last word in dom: " + lastIndexInDomReadingOrder + ", last word in audio: " + lastIndexInWordsInAudio);

            var wordsInGuess = 0;
            for (var wg in uniqueWordsInGuess) {
                if (uniqueWordsInGuess.hasOwnProperty(wg)) {
                    wordsInGuess++;
                }
            }

            var wordsInDom = 0;
            for (var wd in uniqueWordsInReadingOrder) {
                if (uniqueWordsInReadingOrder.hasOwnProperty(wd)) {
                    wordsInDom++;
                }
            }

            guess.recall = wordsInGuess / wordsInDom;
            guess.precision = precision;
            guess.readingOrder = wordsInDomReadingOrder;
            guess.uniqueWordsInGuess = uniqueWordsInGuess;
            guess.uniqueWordsInReadingOrder = uniqueWordsInReadingOrder;
            return guess;
        }
    },

    /*
    This is a little too complex, it tries to survive the reading order being in the wrong order, 
    but results in a rather funny smattering of highlights.. not sequential.
     */
    putElementIdIntoAlignments: {
        value: function(guess, readingOrder) {
            var words = guess.alignment;
            var countOfWordsWhichMightHaveAReadingOrder = 0;
            var numberOfWordsInGuess = 0;
            var uniqueWordsInGuess = {};
            var uniqueWordsInReadingOrder = {};

            for (var w in words) {
                if (words.hasOwnProperty(w)) {
                    if (words[w].text === "</s>" || words[w].text === "<s>") {
                        console.log("skipping word boundaries (silences).");
                        continue;
                    }
                    console.log(words[w].text);
                    uniqueWordsInGuess[words[w].text] = true;
                    numberOfWordsInGuess++;

                    /*
                    Put the reading order into the alignment
                     */
                    // var matchingReadingOrderItems = readingOrder.filter(function(it) {
                    //     var text = "";
                    //     try {
                    //         text = it.text.toUpperCase().split(/[^A-Z0-9'\n.-]/);
                    //     } catch (e) {
                    //         console.log("something is wrong with this reading order item: ", it);
                    //     }
                    //     if (text == words[w].text) {
                    //         console.log("Found something!", it);
                    //         return it;
                    //     }
                    // });
                    // if (matchingReadingOrderItems.length > 0) {
                    //     words[w].matchingReadingOrderItems = matchingReadingOrderItems;
                    //     countOfWordsWhichMightHaveAReadingOrder++;
                    // }

                    /*
                    Put the alignment into the reading order
                     */
                    for (var item = 0; item < readingOrder.length; item++) {
                        var span = readingOrder[item];
                        uniqueWordsInReadingOrder[span.text] = 1;
                        if (span.text.trim().toUpperCase().replace(/[^A-Z0-9'-]/g, "") == words[w].text) {
                            /*
                            This causes the FIRST token of this word in the reading order to be the one that is in the alignment.
                            This only works if the reading order is corrected.
                             */
                            if (span.startTime === undefined && words[w].span === undefined) {
                                span.startTime = parseFloat(words[w].start);
                                span.endTime = parseFloat(words[w].end);
                                countOfWordsWhichMightHaveAReadingOrder++;
                                words[w].span = span;
                                console.log("Found something!", span);
                                continue;
                            }
                        } else {
                            // console.log(words[w].text + ":" + span.text);
                        }
                    }

                }
            }
            console.log("Hypothesis " + guess.hypothesis + " has this many words in the dom: " + countOfWordsWhichMightHaveAReadingOrder);
            guess.countOfWordsWhichMightHaveAReadingOrder = countOfWordsWhichMightHaveAReadingOrder;
            guess.precision = countOfWordsWhichMightHaveAReadingOrder / numberOfWordsInGuess;
            guess.uniqueWordsInGuess = uniqueWordsInGuess;
            guess.uniqueWordsInReadingOrder = uniqueWordsInReadingOrder;

            var wordsInGuess = 0;
            for (var wg in uniqueWordsInGuess) {
                if (uniqueWordsInGuess.hasOwnProperty(wg)) {
                    wordsInGuess++;
                }
            }
            var wordsInDom = 0;
            for (var wd in uniqueWordsInReadingOrder) {
                if (uniqueWordsInReadingOrder.hasOwnProperty(wd)) {
                    wordsInDom++;
                }
            }

            guess.recall = wordsInGuess / wordsInDom;
            /*
            Phase 2: shuffle the reading order to be in order by time, to see if it looks okay... (and maybe insert words that werent in the audio, and smooth)
             */
            var sorted = readingOrder.sort(function(a, b) {
                var astart = a.startTime || 100;
                var bstart = b.startTime || 100;

                return astart - bstart;
            });


            guess.readingOrder = readingOrder;
            return guess;
        }
    }

});