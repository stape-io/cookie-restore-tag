# Cookie reStore Tag for Google Tag Manager Server Container

The cookie reStore Tag is designed to store user identifiers and cookies in Firebase and restore them when needed. 
To make this tag work, you must use the same user identifier (identifiers) and Firebase collection for all sites.

**Firebase Path** - the name of the collection that Tag should use to read/write cookies and user identifiers. When the cookie reStore tag triggers, new documents with specified records will be created. 

**Firebase Project ID** - ID of the Firebase project. When empty, Cookie reStore Tag uses your default project ID.

**List of identifiers** - add a list of user identifiers. It can be one or many.

**List cookies that need to be restored** - list of cookies and cookies lifetime in seconds that should be stored and restored. 

## How to use Cookie reStore tag

- [Server-side cross-domain tracking using Cookie reStore tag](https://stape.io/blog/server-side-cross-domain-tracking-using-cookie-restore-tag)

## Open Source

Cookie reStore Tag for GTM Server Side is developing and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.
