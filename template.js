const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');
const Firestore = require('Firestore');

const identifiersValues = getIdentifiersValues(data.identifiers);
if (identifiersValues.length === 0) {
    data.gtmOnSuccess();

    return;
}

let firebaseOptions = {limit: 1};
if (data.firebaseProjectId) firebaseOptions.projectId = data.firebaseProjectId;

Firestore.query(data.firebasePath, [['identifiersValues', 'array-contains-any', identifiersValues]], firebaseOptions)
    .then((documents) => {
        return restoreCookies(documents && documents.length > 0 ? documents[0] : {});
    }, () => {
        return restoreCookies({});
    });

function restoreCookies(document) {
    let storedData = document.data || {};
    let cookiesToStore = {};

    if (data.cookies && data.cookies.length > 0) {
        data.cookies.forEach(function (cookieObject) {
            let cookies = getCookieValues(cookieObject.name, true);

            if (cookies && cookies.length > 0) {
                cookiesToStore[cookieObject.name] = cookies;
            } else if (storedData.cookies && storedData.cookies[cookieObject.name]) {
                storedData.cookies[cookieObject.name].forEach(function (cookie) {
                    setCookie(cookieObject.name, cookie, {
                        domain: 'auto',
                        path: '/',
                        samesite: 'Lax',
                        secure: true,
                        'max-age': cookieObject.lifetime,
                        httpOnly: false
                    }, true);
                });

                cookiesToStore[cookieObject.name] = storedData.cookies[cookieObject.name];
            }
        });
    }

    if (getObjectLength(cookiesToStore) === 0 || data.onlyRestore) {
        data.gtmOnSuccess();

        return;
    }

    let mergedIdentifiers = mergeIdentifiers(storedData.identifiers, data.identifiers);
    let cookiesDataToStore = {
        identifiers: mergedIdentifiers,
        identifiersValues: getIdentifiersValues(mergedIdentifiers),
        cookies: cookiesToStore,
    };

    Firestore.write(document.id || data.firebasePath, cookiesDataToStore, firebaseOptions)
        .then(() => {
            data.gtmOnSuccess();
        }, data.gtmOnFailure);
}

function getIdentifiersValues(identifiers) {
    let identifiersValues = [];

    if (identifiers && identifiers.length > 0) {
        identifiers.forEach(function (identifier) {
            if (identifier.value) {
                identifiersValues.push(identifier.value);
            }
        });
    }

    return identifiersValues;
}

function mergeIdentifiers(oldIdentifiers, newIdentifiers) {
    let identifiers = [];

    if (oldIdentifiers && oldIdentifiers.length > 0) {
        identifiers = oldIdentifiers;
    }

    if (newIdentifiers && newIdentifiers.length > 0) {
        newIdentifiers.forEach(function (newIdentifier) {
            let identifierFound = false;

            identifiers.forEach(function (identifier) {
                if (identifier.name === newIdentifier.name && newIdentifier.value) {
                    identifier.value = newIdentifier.value;
                    identifierFound = true;
                }
            });

            if (!identifierFound && newIdentifier.value) {
                identifiers.push(newIdentifier);
            }
        });
    }

    return identifiers;
}

function getObjectLength(object) {
    let length = 0;

    for (let key in object) {
        if (object.hasOwnProperty(key)) {
            ++length;
        }
    }
    return length;
}
