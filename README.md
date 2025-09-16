# Cookie reStore Tag for Google Tag Manager Server Container

The **Cookie Restore tag** is designed to store user identifiers and cookies in a persistent storage service (either **Stape Store** or **Firebase**) and restore them when needed. This functionality is essential for maintaining user identity across different domains, devices, or browsing sessions, making it a powerful tool for cross-domain and cross-device tracking.

## How It Works

When the tag fires, it performs the following actions:
1.  It queries the selected storage backend (Stape Store or Firebase) using one or more user identifiers (e.g., `user_id`, `client_id`).
2.  If a matching record is found, it restores any cookies from that record that are not already present in the current request by setting them on the user's browser.
3.  It then updates the storage record with the user's current identifiers and cookies, ensuring the data is synchronized for future visits.

## Storage Options

You can choose one of two services to store your data:

### Stape Store
A simple and powerful key-value storage solution provided by Stape.
- **Stape Store Collection Name**: The name of the collection where user data will be stored. If left empty, `default` will be used.

### Firebase
Uses Google's Firestore to store and retrieve data.
- **Firebase Path**: The name of the Firestore collection that the tag will use to read and write user data.
- **Firebase Project ID**: The ID of your Firebase project. If left empty, the tag will use the default Firebase Project ID associated with your sGTM container's environment.

## Key Parameters

- **Only restore cookies**: If enabled, this option prevents the tag from writing or updating data in the storage backend. It's useful for one-way data synchronization between sites.
- **List of identifiers**: A table where you define the user identifiers (e.g., `user_id`, `email`, `_ga`) and their corresponding values. At least one identifier is required for the tag to function.
- **List cookies that need to be restored**: A table specifying the names of the cookies you want to store and restore, along with their lifetime in seconds.

## How to use the Cookie Restore tag

- [Server-side cross-domain tracking using the Cookie reStore tag](https://stape.io/blog/server-side-cross-domain-tracking-using-cookie-restore-tag)

## Open Source

The **Cookie reStore Tag for GTM Server Side** is developed and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.
