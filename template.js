/// <reference path="./server-gtm-sandboxed-apis.d.ts" />

const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');
const Firestore = require('Firestore');
const getRequestHeader = require('getRequestHeader');
const sendHttpRequest = require('sendHttpRequest');
const JSON = require('JSON');
const encodeUriComponent = require('encodeUriComponent');
const makeString = require('makeString');
const generateRandom = require('generateRandom');
const getType = require('getType');
const getTimestampMillis = require('getTimestampMillis');

/*==============================================================================
==============================================================================*/

const identifiersValues = getIdentifiersValues(data.identifiers);
if (identifiersValues.length === 0) {
  data.gtmOnSuccess();
  return;
}

const firebaseOptions = { limit: 1 };
if (data.flowType === 'firebase') {
  if (data.firebaseProjectId) firebaseOptions.projectId = data.firebaseProjectId;
  Firestore.query(
    data.firebasePath,
    [['identifiersValues', 'array-contains-any', identifiersValues]],
    firebaseOptions
  ).then(
    (documents) => {
      return restoreCookies(documents && documents.length > 0 ? documents[0] : {});
    },
    () => {
      return restoreCookies({});
    }
  );
} else {
  const storeUrl = getStapeStoreBaseUrl(data);
  const postBody = {
    filter: {
      operator: 'and',
      conditions: [
        {
          field: 'identifiersValues',
          operator: 'array-contains-any',
          value: identifiersValues
        }
      ]
    },
    pagination: {
      limit: 1
    }
  };

  sendHttpRequest(
    storeUrl,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify(postBody)
  ).then((response) => {
    const body = JSON.parse(response.body || '{}');
    const document =
      getType(body) === 'object' &&
      getType(body.data) === 'object' &&
      getType(body.data.items) === 'array' &&
      getType(body.data.items[0]) === 'object'
        ? body.data.items[0]
        : {};
    return restoreCookies(document);
  });
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function restoreCookies(document) {
  const storedData = document.data || {};
  const mergedIdentifiers = mergeIdentifiers(storedData.identifiers, data.identifiers);
  const cookiesToStore = {};

  if (data.cookies && data.cookies.length > 0) {
    data.cookies.forEach(function (cookieObject) {
      const cookies = getCookieValues(cookieObject.name, true);

      const hasCookiesToStore = cookies && cookies.length > 0;
      const hasStoredCookiesToRestore = storedData.cookies && storedData.cookies[cookieObject.name];
      const shouldRestoreFromStore =
        hasStoredCookiesToRestore &&
        (data.overwriteExistingCookiesWithValueFromStore || !hasCookiesToStore);

      if (shouldRestoreFromStore) {
        setCookieFunc(cookieObject, storedData.cookies[cookieObject.name][0]);
        cookiesToStore[cookieObject.name] = storedData.cookies[cookieObject.name];
      } else if (hasCookiesToStore) {
        cookiesToStore[cookieObject.name] = cookies;
      }
    });
  }

  if (getObjectLength(cookiesToStore) === 0 || data.onlyRestore) {
    data.gtmOnSuccess();

    return;
  }

  const cookiesDataToStore = {
    identifiers: mergedIdentifiers,
    identifiersValues: getIdentifiersValues(mergedIdentifiers),
    cookies: cookiesToStore
  };

  if (data.flowType === 'firebase') {
    Firestore.write(document.id || data.firebasePath, cookiesDataToStore, firebaseOptions).then(
      data.gtmOnSuccess,
      data.gtmOnFailure
    );
  } else {
    const documentId = document.key || generateDocumentKey();
    const storeDocumentUrl = getStapeStoreDocumentUrl(data, documentId);

    sendHttpRequest(
      storeDocumentUrl,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' } },
      JSON.stringify(cookiesDataToStore)
    ).then((response) => {
      const statusCode = response.statusCode;
      if (statusCode >= 200 && statusCode < 300) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    });
  }
}

function generateDocumentKey() {
  const rnd = makeString(generateRandom(1000000000, 2147483647));
  return 'cookie_' + makeString(getTimestampMillis()) + rnd;
}

function setCookieFunc(cookieObject, cookieData) {
  setCookie(
    cookieObject.name,
    cookieData,
    {
      domain: 'auto',
      path: '/',
      samesite: 'Lax',
      secure: true,
      'max-age': cookieObject.lifetime,
      httpOnly: false
    },
    true
  );
}

function getIdentifiersValues(identifiers) {
  const identifiersValues = [];

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

function getStapeStoreBaseUrl(data) {
  let containerIdentifier;
  let defaultDomain;
  let containerApiKey;
  const collectionPath =
    'collections/' + enc(data.stapeStoreCollectionName || 'default') + '/documents';

  const shouldUseDifferentStore =
    isUIFieldTrue(data.useDifferentStapeStore) &&
    getType(data.stapeStoreContainerApiKey) === 'string';
  if (shouldUseDifferentStore) {
    const containerApiKeyParts = data.stapeStoreContainerApiKey.split(':');

    const containerLocation = containerApiKeyParts[0];
    const containerRegion = containerApiKeyParts[3] || 'io';
    containerIdentifier = containerApiKeyParts[1];
    defaultDomain = containerLocation + '.stape.' + containerRegion;
    containerApiKey = containerApiKeyParts[2];
  } else {
    containerIdentifier = getRequestHeader('x-gtm-identifier');
    defaultDomain = getRequestHeader('x-gtm-default-domain');
    containerApiKey = getRequestHeader('x-gtm-api-key');
  }

  return (
    'https://' +
    enc(containerIdentifier) +
    '.' +
    enc(defaultDomain) +
    '/stape-api/' +
    enc(containerApiKey) +
    '/v2/store/' +
    collectionPath
  );
}

function getStapeStoreDocumentUrl(data, documentId) {
  const storeBaseUrl = getStapeStoreBaseUrl(data);
  return storeBaseUrl + '/' + enc(documentId);
}

/*==============================================================================
  Helpers
==============================================================================*/

function isUIFieldTrue(field) {
  return [true, 'true', 1, '1'].indexOf(field) !== -1;
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

function enc(data) {
  if (['null', 'undefined'].indexOf(getType(data)) !== -1) data = '';
  return encodeUriComponent(makeString(data));
}
