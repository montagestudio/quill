var Montage = require("montage").Montage,
    Promise = require("montage/core/promise").Promise,
    ReadingOrder = require("core/reading-order").ReadingOrder,
    Connection = require("q-connection"),
    adaptConnection = require("q-connection/adapt"),
    Template = require("montage/core/template").Template;


var RAW_EXTENSION = ".raw",
    WAV_EXTENSION = ".wav",
    MP3_EXTENSION = ".mp3";

var debug = false;

/**
 * This controls the read aloud feature of an ebook page.
 */
exports.ReadAlong = Montage.specialize({

    constructor: {
        value: function ReadAlong() {

            this._readingOrder = new ReadingOrder();
            this.playing = false;
            this.playReadAloudReady = false;
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

                if (!this.finalAudio) {
                    var audioElementForThisPage = document.getElementById("audio" + this._pageNumber);
                    if (!audioElementForThisPage) {
                        audioElementForThisPage = document.createElement("audio");
                        audioElementForThisPage.id = "audio" + this._pageNumber;
                        document.body.appendChild(audioElementForThisPage);
                        audioElementForThisPage.addEventListener('ended', function(target) {
                            console.log("Audio is done playing", target);
                            //rewind
                            this.currentTime = 0;
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

    getAudioDuration: {
        value: function(audioUrl) {
            return this.backend.get("read-aloud").invoke("getAudioDuration", audioUrl);
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
                url = this._basePath.replace("OEBPS", "read-aloud-data") + "/voice/" + this._pageNumber + RAW_EXTENSION;
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


    /**
     * The URL of the .smil file which lets the epub reader highlight words in sync with the audio
     */
    _smilWordTimingUrl: {
        value: null
    },

    smilWordTimingUrl: {
        get: function() {
            var url = this._smilWordTimingUrl;

            if (!url && this._basePath && this._pageNumber) {
                url = this._basePath + "/overlay/" + this._pageNumber + ".smil";
            }

            return url;
        },
        set: function(value) {
            if (value && value !== this._smilWordTimingUrl) {
                this._smilWordTimingUrl = value;
            }
        }
    },

    _playReadAloudReady: {
        value: null
    },

    playReadAloudReady: {
        get: function() {
            return this._playReadAloudReady;
        },
        set: function(value) {
            if (value && value !== this._playReadAloudReady) {
                this._playReadAloudReady = value;
            }
        }
    },

    playing: {
        value: null
    },

    playReadAloud: {
        value: function() {
            if (!this.finalAudioUrl || !this.finalAudio) {
                console.log("No audio for " + this._pageNumber);
                return;
            }

            /* if we are not at the beginning of the audio, resume play */
            if (this.finalAudio.currentTime > 0) {
                this.finalAudio.play();
                console.log("Resumed play read aloud for " + this.xhtmlUrl);
                this.playing = true;
                return;
            }

            var readingOrderToDraw = this.getBestGuessForReadingOrder();
            console.log("Playing read along guess ", readingOrderToDraw);
            if (debug) {
                console.log(readingOrderToDraw);
            }
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

            var self = this;
            this.finalAudio.addEventListener('ended', function(target) {
                if (self) {
                    self.playing = false;
                }
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

    pauseReadAloud: {
        value: function() {
            this.finalAudio.pause();
            this.playing = false;
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


    hasReadAlong: {
        value: null
    },

    _readingOrder: {
        value: null
    },

    readingOrder: {
        get: function() {
            if (debug) {
                console.log("get readingOrder", this._readingOrder);
            }

            return this._readingOrder;
        },
        set: function(value) {
            if (debug) {
                console.log("set readingOrder", value);
            }

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
            var self = this;

            this.alignmentResults = this.alignmentResults || [];
            var srcUri = this._xhtmlUrl.replace("http://client/index.html?file=", "");
            this.readingOrder.loadFromXHTML(srcUri).then(function(order) {
                self.triggerAlignerWithReadingOrder();
            });
        }
    },

    _backend: {
        value: null
    },

    backend: {
        get: function() {
            var self = this,
                resolvePort = function() {
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
                connection.closed.then(function() {
                    self._backend = null;
                });

                self._backend = Connection(connection);
            }

            return self._backend;
        }
    },

    triggerAlignerWithReadingOrder: {
        value: function() {
            var deferred = Promise.defer(),
                self = this;

            Promise.nextTick(function() {

                self.readingOrder.text.then(function(text) {
                    self.textContent = text;
                    self.backend.get("read-aloud").invoke("runAligner", {
                        "xhtml": self.xhtmlUrl.replace("fs://localhost", ""),
                        "voice": self.voiceAudioUrl.replace("fs://localhost", ""),
                        "finalAudio": self.finalAudioUrl,
                        "pageNumber": self._pageNumber,
                        "basePath": self.basePath,
                        "readingOrder": self.readingOrder.contents,
                        "text": text
                    }).then(function(alignment) {

                        var alignedAudioFile = alignment.finalAudio;
                        if (alignedAudioFile && alignment.alignmentResults && alignment.alignmentResults[0] && alignment.alignmentResults[0].guesses && alignment.alignmentResults[0].guesses["1"]) {
                            self.alignmentResults = self.alignmentResults || [];
                            self.alignmentResults.push(alignment);
                            if (debug) {
                                console.log("Alignment returned guesses ", alignment);
                            }
                            if (alignedAudioFile.indexOf("/") === 0) {
                                alignedAudioFile = "fs://localhost" + alignedAudioFile;
                            }
                            var bestReadingOrder = self.tryToAutomaticallyPatchTheReadingOrderUsingAudioAlignment(alignment);
                            if (debug) {
                                console.log("Recieved the bestReadingOrder of " + bestReadingOrder);
                            }
                            deferred.resolve(bestReadingOrder);
                            return;
                        } else {
                            console.log(self.xhtmlUrl + "Aligned audio file or alignment results is missing, returning empty reading order.");
                        }
                        deferred.resolve([]);

                    }, function(error) {
                        console.log("Error running the aligner. " + self.xhtmlUrl, error);
                        deferred.resolve([]);
                    });
                }, function(error) {
                    console.log("Error extracting text for " + self.xhtmlUrl, error);
                    deferred.resolve([]);
                });

            });
            return deferred.promise;
        }
    },

    getBestGuessForReadingOrder: {
        value: function() {
            var guesses = this.alignmentResults[this.alignmentResults.length - 1].alignmentResults[0].guesses;
            var bestGuessInTermsOfRecall;
            var bestGuessInTermsOfPrecision;
            var bestGuessInTermsOffScore;

            for (var g in guesses) {
                if (guesses.hasOwnProperty(g)) {
                    var guess = guesses[g];
                    console.log(this.xhtmlUrl + " Guess: " + guess.hypothesis + " rank: " + guess.rank + " Precision: " + guess.precision + " Recall: " + guess.recall);
                    if (guess.readingOrder) {
                        if (!bestGuessInTermsOfRecall || guess.recall > bestGuessInTermsOfRecall.recall) {
                            bestGuessInTermsOfRecall = guess;
                        }
                        if (!bestGuessInTermsOfPrecision || guess.precision > bestGuessInTermsOfPrecision.precision) {
                            bestGuessInTermsOfPrecision = guess;
                        }
                        if (!bestGuessInTermsOffScore || guess.fScore > bestGuessInTermsOffScore.precision) {
                            bestGuessInTermsOffScore = guess;
                        }
                    } else {
                        console.log("This guess is missing a reading order. " + guess.rank);
                    }
                }
            }

            return bestGuessInTermsOffScore.readingOrder;
        }
    },

    convertToSMIL: {
        value: function(readingOrder) {
            var self = this,
                deffered = Promise.defer();

            Promise.nextTick(function() {
                var smilXML = '<?xml version="1.0" encoding="UTF-8"?>\n' +
                    '<smil xmlns="http://www.w3.org/ns/SMIL" xmlns:epub="http://www.idpf.org/2007/ops" version="3.0">\n' +
                    '\t<seq id="id1" epub:textref="pages/6.xhtml" epub:type="bodymatter part">\n';
                for (var item = 0; item < readingOrder.length; item++) {
                    if (readingOrder[item].startTime === undefined) {
                        continue;
                    }
                    var paralel = '\t\t<par id="' + readingOrder[item].id + '">\n';
                    paralel = paralel + '\t\t\t<text src="pages/' + self._pageNumber + ".xhtml" + "#" + readingOrder[item].id + '"></text>\n';
                    paralel = paralel + '\t\t\t<audio src="' + "audio/" + self._pageNumber + MP3_EXTENSION + '" clipBegin="' + readingOrder[item].startTime + '" clipEnd="' + readingOrder[item].endTime + '"></audio>\n';
                    paralel = paralel + '\t\t</par>\n';
                    smilXML = smilXML + paralel;
                }
                smilXML = smilXML + '\t</seq>\n</smil>';
                deffered.resolve(smilXML);
            });
            return deffered.promise;
        }
    },

    convertToSMILDeprecated: {
        value: function(readingOrder) {
            var self = this,
                deffered = Promise.defer();

            Promise.nextTick(function() {
                if (debug) {
                    console.log("Reading .smil " + self.smilWordTimingUrl);
                }

                require.read(self.smilWordTimingUrl).then(function(smilxml) {
                    var doc,
                        template;

                    template = Template.create();
                    doc = template.createHtmlDocumentWithHtml(smilxml);
                    var removeTextOverlayTimingSinceWeHaveWords = false;


                    var sequentialBlock = doc.getElementById("id1");
                    for (var item = 0; item < readingOrder.length; item++) {
                        if (readingOrder[item].startTime === undefined) {
                            continue;
                        }
                        var paralel = doc.createElement("par");
                        paralel.id = readingOrder[item].id;

                        var text = doc.createElement("text");
                        text.setAttribute("src", self._pageNumber + ".xhtml" + "#" + readingOrder[item].id);

                        var audio = doc.createElement("audio");
                        audio.setAttribute("src", "audio/" + self._pageNumber + MP3_EXTENSION);
                        audio.setAttribute("clipBegin", readingOrder[item].startTime);
                        audio.setAttribute("clipEnd", readingOrder[item].endTime);
                        paralel.appendChild(audio);
                        audio.parentNode.insertBefore(text, audio);
                        sequentialBlock.appendChild(paralel);
                        removeTextOverlayTimingSinceWeHaveWords = true;
                    }

                    if (removeTextOverlayTimingSinceWeHaveWords) {
                        var element = doc.getElementById("textOverlay");
                        element.parentNode.removeChild(element);
                    }

                    if (debug) {
                        console.log("Returning .smil " + self.smilWordTimingUrl);
                    }
                    deffered.resolve('<?xml version="1.0" encoding="UTF-8"?>\n' + doc.body.innerHTML);
                });
            });
            return deffered.promise;
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
                    // if (readingOrder && readingOrder.length < 35) {
                    //     guess = this.fitWordsToAlignmentTimesRegardlessOfText(guess, readingOrder.slice());
                    // } else {
                    /* Otherwise, only show words that actually match the audio guesses */
                    // guess = this.putElementIdIntoAlignments(guess, readingOrder.slice());
                    guess = this.matchWordsToAlignmentToReadingOrder(guess, readingOrder.slice());
                    // }
                    // console.log(guess);
                    // }
                    this.playReadAloudReady = true;
                }
            }
            if (debug) {
                console.log("tryToAutomaticallyPatchTheReadingOrderUsingAudioAlignment" + JSON.stringify(alignment, null, 2));
            }
            return this.getBestGuessForReadingOrder();
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

    matchWordsToAlignmentToReadingOrder: {
        value: function(guess, readingOrder) {
            var wordsInAudio = guess.alignment;
            var wordsInDomReadingOrder = readingOrder;
            var uniqueWordsInGuess = {};
            var uniqueWordsInReadingOrder = {};

            var precision = 0,
                previousWordWithKnowEndTime,
                openmindednessForNextWord = 1;

            //Go through the reading order
            for (var wordIndex = 0; wordIndex < wordsInDomReadingOrder.length; wordIndex++) {
                // console.log("\n\n Working on " + wordsInDomReadingOrder[wordIndex].text);
                uniqueWordsInReadingOrder[wordsInDomReadingOrder[wordIndex].text] = 1;

                // Find the first pronuncaition of this word which is close to the end time of the previous word
                for (var wordIndexInAlignment in wordsInAudio) {
                    if (wordsInAudio.hasOwnProperty(wordIndexInAlignment)) {
                        uniqueWordsInGuess[wordsInAudio[wordIndexInAlignment].text] = 1;
                        if (wordsInDomReadingOrder[wordIndex].text.trim().toUpperCase().replace(/[^A-Z0-9'-]/g, "") === wordsInAudio[wordIndexInAlignment].text.trim().toUpperCase().replace(/[^A-Z0-9'-]/g, "")) {
                            // console.log("Found a match: " + wordsInDomReadingOrder[wordIndex].text + " at " + wordsInAudio[wordIndexInAlignment].start);

                            if (!previousWordWithKnowEndTime) {
                                previousWordWithKnowEndTime = {
                                    text: "<sil>",
                                    endTime: wordsInAudio[wordIndexInAlignment].start
                                };
                            }

                            if (parseFloat(wordsInAudio[wordIndexInAlignment].start) >= previousWordWithKnowEndTime.endTime && parseFloat(wordsInAudio[wordIndexInAlignment].start) - previousWordWithKnowEndTime.endTime <= openmindednessForNextWord) {
                                // console.log("\t" + previousWordWithKnowEndTime.text + " at " + previousWordWithKnowEndTime.endTime + " -> " + wordsInDomReadingOrder[wordIndex].text + " starting at " + wordsInAudio[wordIndexInAlignment].start);
                                wordsInDomReadingOrder[wordIndex].startTime = parseFloat(wordsInAudio[wordIndexInAlignment].start);
                                wordsInDomReadingOrder[wordIndex].endTime = parseFloat(wordsInAudio[wordIndexInAlignment].end);
                                wordsInDomReadingOrder[wordIndex].audioText = wordsInAudio[wordIndexInAlignment].text;
                                previousWordWithKnowEndTime = wordsInDomReadingOrder[wordIndex];
                                wordsInAudio[wordIndexInAlignment].text = ""; //empty out the word in the audio so its timings wont be used again.
                                precision++;
                                openmindednessForNextWord = 1;
                                break;
                            } else {
                                if (parseFloat(wordsInAudio[wordIndexInAlignment].start) >= previousWordWithKnowEndTime.endTime) {
                                    openmindednessForNextWord++;

                                }
                                if (debug) {
                                    console.log("\tThis word is at " + wordsInAudio[wordIndexInAlignment].start + " too far away from the previous word " + previousWordWithKnowEndTime.endTime + " new openmindedness " + openmindednessForNextWord);
                                }
                            }
                        }
                    }
                }

            }
            // console.log("Hypothesis " + guess.hypothesis + "; Last word in dom: " + lastIndexInDomReadingOrder + ", last word in audio: " + lastIndexInWordsInAudio);

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
            guess.recall = 0;
            guess.precision = 0;
            if (wordsInDom) {
                guess.recall = wordsInGuess / wordsInDom;
            }
            if (readingOrder.length > 0) {
                guess.precision = precision / readingOrder.length;
            }
            guess.fScore = 0;
            if (guess.precision && guess.recall) {
                guess.fScore = 2 * ((guess.precision * guess.recall) / (guess.precision + guess.recall));
            }
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
                    if (debug) {
                        console.log(words[w].text);
                    }
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
                    var previousWordWithKnowEndTime = {
                        "endTime": 0
                    };
                    for (var item = 0; item < readingOrder.length; item++) {
                        var span = readingOrder[item];
                        uniqueWordsInReadingOrder[span.text] = 1;

                        if (span.text.trim().toUpperCase().replace(/[^A-Z0-9'-]/g, "") == words[w].text.trim().toUpperCase().replace(/[^A-Z0-9'-]/g, "")) {
                            /*
                            This causes the FIRST token of this word in the reading order to be the one that is in the alignment.
                            This only works if the reading order is corrected.
                             */
                            if (span.startTime === undefined && words[w].readingOrder === undefined) {
                                if (debug) {
                                    console.log("previousWordWithKnowEndTime : " + previousWordWithKnowEndTime.endTime + " this words start time " + words[w].start);
                                }
                                span.startTime = parseFloat(words[w].start);
                                span.endTime = parseFloat(words[w].end);
                                previousWordWithKnowEndTime = span;
                                countOfWordsWhichMightHaveAReadingOrder++;
                                words[w].readingOrder = span.readingOrder;
                                if (debug) {
                                    console.log("Found something!", span);
                                }
                                continue;
                            } else {
                                if (debug) {
                                    console.log(words[w].text + ":" + span.text);
                                }
                            }
                        }
                    }

                }
            }
            if (debug) {
                console.log("Hypothesis " + guess.hypothesis + " has this many words in the dom: " + countOfWordsWhichMightHaveAReadingOrder);
            }
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