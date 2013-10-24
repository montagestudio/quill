exports.setup = function(firstLoad, capabilities) {
    if (firstLoad) {
        console.log("Initializing quill backend:", capabilities.application);
        capabilities.application.invoke("openWindow", {url:"http://client/application-controller/index.html", width:400, height:600, canOpenMultiple:false, showWindow: false}).done();
    }
};


/*
    allowedFileTypes

    called when the user open the Open or Save panel
    returns an array of file types (extension or UTI) that filament will accept to open
*/
exports.allowedFileTypes = function (object) {
    var response = {types: []};

    if (object.mode === "open") {
        response.types = ["com.declarativ.book"];
    }

    return response;
};

/*
    documentURLForFileType

    called before opening/creating a document window
    returns the URL for the document or null if type not supported
*/
exports.documentURLForFileType = function(object) {
    console.log("documentURLForFileType", object);
    switch (object.type) {
//        case "public.folder":
//        case "com.adobe.pdf":
//            return "http://client/importer/index.html";

    case "com.declarativ.book":
        return "http://client/index.html";
    }

    return null;
};


/*
    validateFileURL

    called to validate a file URL (url) before opening it
    returns result=true or result=false and an error
*/
exports.validateFileURL = function(object) {
    return {result: true, error: null};

//    var filePath = PATH.normalize(decodeURI(URL.parse(object.url).path));
//
//    var response = {
//        result: false,
//        error: "This folder is not a valid package or application."
//    };
//
//    try {
//        if (FS.statSync(filePath).isDirectory()) {
//            var packagePath = findPackage(filePath);
//
//            if (packagePath) {
//                response.result = true;
//                response.error = null;
//            }
//            return response;
//        } else {
//            // For now, accept any type of files...
//            response.result = true;
//            response.error = null;
//            return response;
//        }
//    } catch(ex) {
//        console.log("ERROR:", ex);
//        return response;
//    }
};

/*
    rootURLForFileURL

    called to retrieve the root URL of a File URL or null if it's not a valid document
*/
exports.rootURLForFileURL = function(object) {

//    var filePath = PATH.normalize(decodeURI(URL.parse(object.url).path)),
//        packagePath = findPackage(filePath);
//
//    if (packagePath) {
//        return "file://" + PATH.join(packagePath, "..");
//    }

    // Always return the same root for all imported document
    console.log("rootURLForFileURL", object);
//    if (object.url.substr(-4) === ".pdf") {
//       return  "file://localhost/importer";
//    }

    return null;
};

exports.aboutPageInfo = function() {
    return null; // return null to use default about panel
};

exports.welcomePageInfo = function() {
    return {url: "http://client/welcome/index.html", width:800, height:480};
//    return null;
};

exports.preferencesPageInfo = function() {
//    return {url: "http://client/preferences/index.html", width:906, height:540};
    return null;
};

exports.previewPageInfo = function() {
//    return {url: "http://client/preview/index.html"};
    return null;
};

exports.menusAddOns = function() {
//    return [
//        {
//            location: {"replace": "newDocument"},
//            items: [
//                {
//                    title: "Application…",
//                    enabled: true,
//                    keyEquivalent: "command+N",
//                    identifier: "newApplication",
//                    action: {openDocument: {type: "application"}}
//                },
//                {
//                    title: "Component…",
//                    enabled: false,
//                    keyEquivalent: "command+shift+N",
//                    identifier: "newComponent"
//                },
//                {
//                    title: "Module…",
//                    enabled: false,
//                    keyEquivalent: "command+control+shift+N",
//                    identifier: "newModule"
//                }
//            ]
//        },
//
//        {
//            title: "Documentation and API Reference",
//            identifier: "help",
//            keyEquivalent: "command+option+?",
//            location: {insertBefore: "7.1"},
//            action: {openWindow: {url:"http://montagejs.org/docs/", width:650, height:800, canResize:true, showToolbar:true, canOpenMultiple: false}}
//        }
//    ];

    return [
        {
            location: {"remove": "newDocument"}
        },

        {
            location: {"insertAfter": "revertDocumentToSaved"},
            title: "Import…",
            enabled: true,
            keyEquivalent: "command+I",
            identifier: "importDocument",
            action: {dispatchTo: {url:"http://client/application-controller/index.html"}}
        },

        {
            location: {"insertAfter": "revertDocumentToSaved"},
            separator: true
        },

        {
            location: {"insertBefore": "arrangeInFront"},
            title: "Import Activity",
            enabled: true,
            identifier: "importDocument",
            action: {openWindow: {url:"http://client/import-activity/index.html", width:400, height:600, canResize:true, showToolbar:false, canOpenMultiple: false}}
        }

    ];
};


// Private utilities functions

//var findPackage = function(parentPath) {
//    if (FS.existsSync(PATH.join(parentPath, "package.json"))) {
//        return PATH.join(parentPath, "package.json");
//    } else if ("/" === parentPath) {
//        return null;
//    } else if (/*PATH.extname(path).toLocaleString() === ".reel"*/true) {
//        return findPackage(PATH.normalize(PATH.join(parentPath, "..")));
//    }
//
//    return null;
//};
