var enumIndex = 0;

exports.importStates = {
    unknown: enumIndex ++,             // We haven't started doing anything yet
    fetching: enumIndex ++,            // Fetching metadata
    fetchError: enumIndex ++,          // Fetching metadata
    waiting: enumIndex ++,             // Waiting turn to be converted
    converting: enumIndex ++,          // Converting pages
    stalled: enumIndex ++,             // Conversion stalled
    converted: enumIndex ++,           // All pages converted
    optimizing: enumIndex ++,          // Optimizing pages and assets
    convertingAudio: enumIndex ++,     // Converting audio to .raw
    generatingAudioAlignment: enumIndex ++, // Converting audio and text to .smil
    generating: enumIndex ++,          // Generating EPUB3 file
    error: enumIndex ++,               // error, import aborted
    ready: enumIndex ++                // Done!
};
