/// <reference path="./server-gtm-sandboxed-apis.d.ts" />

const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');
const Firestore = require('Firestore');
const getRequestHeader = require('getRequestHeader');
const sendHttpRequest = require('sendHttpRequest');
const JSON = require('JSON');
const encodeUriComponent = require('encodeUriComponent');
const logToConsole = require('logToConsole');
const getContainerVersion = require('getContainerVersion');
const makeString = require('makeString');
const generateRandom = require('generateRandom');
const getType = require('getType');
const getTimestampMillis = require('getTimestampMillis');
const BigQuery = require('BigQuery');

/*==============================================================================
==============================================================================*/

const traceId = getRequestHeader('trace-id');

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
  const storeUrl = getStoreBaseUrl(data);
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

  log({
    Name: 'CookieRestore',
    Type: 'Request',
    TraceId: traceId,
    EventName: 'CookieRestorePOST',
    RequestMethod: 'POST',
    RequestUrl: storeUrl,
    RequestBody: postBody
  });

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

    log({
      Name: 'CookieRestore',
      Type: 'Response',
      TraceId: traceId,
      EventName: 'CookieRestorePOST',
      ResponseStatusCode: response.statusCode,
      ResponseHeaders: {},
      ResponseBody: response.body
    });
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

      if (cookies && cookies.length > 0) {
        cookiesToStore[cookieObject.name] = cookies;
      } else if (storedData.cookies && storedData.cookies[cookieObject.name]) {
        setCookieFunc(cookieObject, storedData.cookies[cookieObject.name][0]);
        cookiesToStore[cookieObject.name] = storedData.cookies[cookieObject.name];
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
    const storeDocumentUrl = getDocumentUrl(data, documentId);

    log({
      Name: 'CookieRestore',
      Type: 'Request',
      TraceId: traceId,
      EventName: 'CookierRestorePUT',
      RequestMethod: 'PUT',
      RequestUrl: storeDocumentUrl,
      RequestBody: cookiesDataToStore
    });

    sendHttpRequest(
      storeDocumentUrl,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' } },
      JSON.stringify(cookiesDataToStore)
    ).then((response) => {
      const statusCode = response.statusCode;
      log({
        Name: 'CookierRestore',
        Type: 'Response',
        TraceId: traceId,
        EventName: 'CookierRestorePUT',
        ResponseStatusCode: statusCode,
        ResponseHeaders: {},
        ResponseBody: response.body
      });

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

function getStoreBaseUrl(data) {
  const containerIdentifier = getRequestHeader('x-gtm-identifier');
  const defaultDomain = getRequestHeader('x-gtm-default-domain');
  const containerApiKey = getRequestHeader('x-gtm-api-key');
  const collectionPath = 'collections/' + enc(data.collectionName || 'default') + '/documents';

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

function getDocumentUrl(data, documentId) {
  const storeBaseUrl = getStoreBaseUrl(data);
  return storeBaseUrl + '/' + enc(documentId);
}

/*==============================================================================
  Helpers
==============================================================================*/

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
  return encodeUriComponent(makeString(data || ''));
}

function log(rawDataToLog) {
  const logDestinationsHandlers = {};
  if (determinateIsLoggingEnabled()) logDestinationsHandlers.console = logConsole;
  if (determinateIsLoggingEnabledForBigQuery()) logDestinationsHandlers.bigQuery = logToBigQuery;

  const keyMappings = {
    // No transformation for Console is needed.
    bigQuery: {
      Name: 'tag_name',
      Type: 'type',
      TraceId: 'trace_id',
      EventName: 'event_name',
      RequestMethod: 'request_method',
      RequestUrl: 'request_url',
      RequestBody: 'request_body',
      ResponseStatusCode: 'response_status_code',
      ResponseHeaders: 'response_headers',
      ResponseBody: 'response_body'
    }
  };

  for (const logDestination in logDestinationsHandlers) {
    const handler = logDestinationsHandlers[logDestination];
    if (!handler) continue;

    const mapping = keyMappings[logDestination];
    const dataToLog = mapping ? {} : rawDataToLog;

    if (mapping) {
      for (const key in rawDataToLog) {
        const mappedKey = mapping[key] || key;
        dataToLog[mappedKey] = rawDataToLog[key];
      }
    }

    handler(dataToLog);
  }
}

function logConsole(dataToLog) {
  logToConsole(JSON.stringify(dataToLog));
}

function logToBigQuery(dataToLog) {
  const connectionInfo = {
    projectId: data.logBigQueryProjectId,
    datasetId: data.logBigQueryDatasetId,
    tableId: data.logBigQueryTableId
  };

  dataToLog.timestamp = getTimestampMillis();

  ['request_body', 'response_headers', 'response_body'].forEach((p) => {
    dataToLog[p] = JSON.stringify(dataToLog[p]);
  });

  BigQuery.insert(connectionInfo, [dataToLog], { ignoreUnknownValues: true });
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

function determinateIsLoggingEnabledForBigQuery() {
  if (data.bigQueryLogType === 'no') return false;
  return data.bigQueryLogType === 'always';
}
