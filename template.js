const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');
const Firestore = require('Firestore');
const getRequestHeader = require('getRequestHeader');
const sendHttpRequest = require('sendHttpRequest');
const JSON = require('JSON');
const encodeUriComponent = require('encodeUriComponent');
const logToConsole = require('logToConsole');
const getContainerVersion = require('getContainerVersion');
const Object = require('Object');
const makeString = require('makeString');
const generateRandom = require('generateRandom');
const getTimestampMillis = require('getTimestampMillis');

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;
const storeUrl = getStoreUrl();

const identifiersValues = getIdentifiersValues(data.identifiers);
if (identifiersValues.length === 0) {
  data.gtmOnSuccess();

  return;
}

let firebaseOptions = { limit: 1 };
if (data.flowType === 'firebase') {
  if (data.firebaseProjectId)
    firebaseOptions.projectId = data.firebaseProjectId;
  Firestore.query(
    data.firebasePath,
    [['identifiersValues', 'array-contains-any', identifiersValues]],
    firebaseOptions,
  ).then(
    (documents) => {
      return restoreCookies(
        documents && documents.length > 0 ? documents[0] : {},
      );
    },
    () => {
      return restoreCookies({});
    },
  );
} else {
  let filters = getStoreFilter(identifiersValues);
  sendHttpRequest(
    storeUrl,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({
      limit: 1,
      data: filters,
    }),
  ).then((documents) => {
    let body = JSON.parse(documents.body);
    let preparedData = { data: {}, key: '' };
    if (body && body.length > 0) {
      preparedData = body[0].data;
      preparedData.key = body[0].key;
    }
    log({
      Name: 'CookieRestore',
      Type: 'Response',
      TraceId: traceId,
      EventName: 'CookieRestorePOST',
      RequestMethod: 'POST',
      RequestUrl: storeUrl,
      RequestBody: documents,
    });
    return restoreCookies({ data: preparedData });
  });
}

function restoreCookies(document) {
  let storedData = document.data || {};
  let mergedIdentifiers = mergeIdentifiers(
    storedData.identifiers,
    data.identifiers,
  );
  let cookiesToStore = {};

  if (data.cookies && data.cookies.length > 0) {
    data.cookies.forEach(function (cookieObject) {
      let cookies = getCookieValues(cookieObject.name, true);

      if (cookies && cookies.length > 0) {
        cookiesToStore[cookieObject.name] = cookies;
      } else if (storedData.cookies && storedData.cookies[cookieObject.name]) {
        setCookieFunc(cookieObject, storedData.cookies[cookieObject.name][0]);
        cookiesToStore[cookieObject.name] =
          storedData.cookies[cookieObject.name];
      }
    });
  }

  if (getObjectLength(cookiesToStore) === 0 || data.onlyRestore) {
    data.gtmOnSuccess();

    return;
  }
  let cookiesDataToStore = {
    identifiers: mergedIdentifiers,
    identifiersValues: getIdentifiersValues(mergedIdentifiers),
    cookies: cookiesToStore,
  };
  if (data.flowType === 'firebase') {
    Firestore.write(
      document.id || data.firebasePath,
      cookiesDataToStore,
      firebaseOptions,
    ).then(() => {
      data.gtmOnSuccess();
    }, data.gtmOnFailure);
  } else {
    let documentKey = storedData.key || generateDocumentKey();
    let storeDocumentUrl = storeUrl + '/' + enc(documentKey);
    sendHttpRequest(
      storeDocumentUrl,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' } },
      JSON.stringify(cookiesDataToStore),
    ).then(function (response) {
      let statusCode = response.statusCode;
      log({
        Name: 'CookierRestore',
        Type: 'Response',
        TraceId: traceId,
        EventName: 'CookierRestorePUT',
        ResponseStatusCode: statusCode,
        ResponseHeaders: {},
        ResponseBody: JSON.stringify(response),
      });
      if (statusCode >= 200 && statusCode < 300) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    });
  }
}

function getStoreFilter(values) {
  return [['identifiersValues', 'array-contains-any', values]];
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
      httpOnly: false,
    },
    true,
  );
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

function getStoreUrl() {
  const containerIdentifier = getRequestHeader('x-gtm-identifier');
  const defaultDomain = getRequestHeader('x-gtm-default-domain');
  const containerApiKey = getRequestHeader('x-gtm-api-key');

  return (
    'https://' +
    enc(containerIdentifier) +
    '.' +
    enc(defaultDomain) +
    '/stape-api/' +
    enc(containerApiKey) +
    '/v1/store'
  );
}

function enc(data) {
  data = data || '';
  return encodeUriComponent(data);
}

function log(logObject) {
  if (isLoggingEnabled) {
    logToConsole(JSON.stringify(logObject));
  }
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}
