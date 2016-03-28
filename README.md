# Nightmare

## Setup

```
npm install
```

Also, make sure Chrome is installed on your local machine, since tests require chrome remote debugging against a running instance of Chrome.

## Running

```
$ USERNAME=thejsj PASSWORD=SOME_PASSWORD LIMIT=50 npm test
```

You must provide a Github username/password with access to Runnable. These are required. A limit is optional (default: 20).

Sample output would look something like this:

```
$ USERNAME=thejsj PASSWORD=SOME_PASSOWRD LIMIT=50 npm test

> 02-nightmare@1.0.0 test /Users/hiphipjorge/runnable/testy-time/02-nightmare
> node index.js

Tue Feb 09 2016 12:57:52 GMT-0800 (PST): Login to Runnable
Tue Feb 09 2016 12:58:05 GMT-0800 (PST): Loggged in to Runnable
Tue Feb 09 2016 12:58:10 GMT-0800 (PST): Createing Branches
Tue Feb 09 2016 12:58:11 GMT-0800 (PST): Branches Created
Tue Feb 09 2016 12:58:29 GMT-0800 (PST): Branches 1/50
Tue Feb 09 2016 12:58:29 GMT-0800 (PST): Branches 2/50
Tue Feb 09 2016 12:58:29 GMT-0800 (PST): Branches 3/50
Tue Feb 09 2016 12:58:29 GMT-0800 (PST): Branches 4/50
Tue Feb 09 2016 12:58:29 GMT-0800 (PST): Branches 5/50
Tue Feb 09 2016 12:58:30 GMT-0800 (PST): Branches 6/50
Tue Feb 09 2016 12:58:30 GMT-0800 (PST): Branches 7/50
Tue Feb 09 2016 12:58:30 GMT-0800 (PST): Branches 8/50
Tue Feb 09 2016 12:58:30 GMT-0800 (PST): Branches 9/50
Tue Feb 09 2016 12:58:30 GMT-0800 (PST): Branches 10/50
Tue Feb 09 2016 12:58:30 GMT-0800 (PST): Branches 11/50
Tue Feb 09 2016 12:58:31 GMT-0800 (PST): Branches 12/50
Tue Feb 09 2016 12:58:31 GMT-0800 (PST): Branches 13/50
Tue Feb 09 2016 12:58:31 GMT-0800 (PST): Branches 14/50
Tue Feb 09 2016 12:58:31 GMT-0800 (PST): Branches 15/50
Tue Feb 09 2016 12:58:32 GMT-0800 (PST): Branches 16/50
Tue Feb 09 2016 12:58:32 GMT-0800 (PST): Branches 17/50
Tue Feb 09 2016 12:58:32 GMT-0800 (PST): Branches 18/50
Tue Feb 09 2016 12:58:32 GMT-0800 (PST): Branches 19/50
Tue Feb 09 2016 12:58:32 GMT-0800 (PST): Branches 20/50
Tue Feb 09 2016 12:58:32 GMT-0800 (PST): Branches 21/50
Tue Feb 09 2016 12:58:33 GMT-0800 (PST): Branches 22/50
Tue Feb 09 2016 12:58:33 GMT-0800 (PST): Branches 23/50
Tue Feb 09 2016 12:58:33 GMT-0800 (PST): Branches 24/50
Tue Feb 09 2016 12:58:33 GMT-0800 (PST): Branches 25/50
Tue Feb 09 2016 12:58:33 GMT-0800 (PST): Branches 26/50
Tue Feb 09 2016 12:58:33 GMT-0800 (PST): Branches 27/50
Tue Feb 09 2016 12:58:34 GMT-0800 (PST): Branches 28/50
Tue Feb 09 2016 12:58:34 GMT-0800 (PST): Branches 29/50
Tue Feb 09 2016 12:58:34 GMT-0800 (PST): Branches 30/50
Tue Feb 09 2016 12:58:34 GMT-0800 (PST): Branches 31/50
Tue Feb 09 2016 12:58:35 GMT-0800 (PST): Branches 32/50
Tue Feb 09 2016 12:58:35 GMT-0800 (PST): Branches 33/50
Tue Feb 09 2016 12:58:35 GMT-0800 (PST): Branches 34/50
Tue Feb 09 2016 12:58:35 GMT-0800 (PST): Branches 35/50
Tue Feb 09 2016 12:58:36 GMT-0800 (PST): Branches 36/50
Tue Feb 09 2016 12:58:36 GMT-0800 (PST): Branches 37/50
Tue Feb 09 2016 12:58:36 GMT-0800 (PST): Branches 38/50
Tue Feb 09 2016 12:58:37 GMT-0800 (PST): Branches 39/50
Tue Feb 09 2016 12:58:37 GMT-0800 (PST): Branches 40/50
Tue Feb 09 2016 12:58:37 GMT-0800 (PST): Branches 41/50
Tue Feb 09 2016 12:58:37 GMT-0800 (PST): Branches 42/50
Tue Feb 09 2016 12:58:37 GMT-0800 (PST): Branches 43/50
Tue Feb 09 2016 12:58:37 GMT-0800 (PST): Branches 44/50
Tue Feb 09 2016 12:58:38 GMT-0800 (PST): Branches 45/50
Tue Feb 09 2016 12:58:38 GMT-0800 (PST): Branches 46/50
Tue Feb 09 2016 12:58:38 GMT-0800 (PST): Branches 47/50
Tue Feb 09 2016 12:58:38 GMT-0800 (PST): Branches 48/50
Tue Feb 09 2016 12:58:38 GMT-0800 (PST): Branches 49/50
Tue Feb 09 2016 12:58:38 GMT-0800 (PST): Dones in 27.688 seconds
Tue Feb 09 2016 12:58:40 GMT-0800 (PST): All branches deleted
```

You can also manually create/delete branches

```
npm run create
npm run delete
```

These commands don't require GH credentials

## Troubleshouting

If you get an error make sure that all instances of chrome opened by the tests are closed. They should close automatically, but this might not happend if the tests don't finish.

```
Error: No page with the given url was found
    at /Users/hiphipjorge/runnable/testy-time/02-nightmare/node_modules/steer/node_modules/inspector/inspector.js:82:43
    at Endpoint.finish (/Users/hiphipjorge/runnable/testy-time/02-nightmare/node_modules/steer/node_modules/inspector/node_modules/endpoint/endpoint.js:36:5)
```
