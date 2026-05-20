'use strict';

import { format } from 'util';

function request(options, callback) {
    fetch(options.url, { method: options.method, headers: options.headers })
        .then(function(response) {
            return response.text().then(function(body) {
                callback(null, { statusCode: response.status, headers: { 'content-type': response.headers.get('content-type') } }, body);
            });
        })
        .catch(function(err) {
            callback(err);
        });
}

function FastlyPurge(apiKey, options) {
    this._apiKey = apiKey;

    this._options = defaults(options || {}, {
        softPurge: false
    });
}

var FASTLY_API_ENDPOINT = 'https://api.fastly.com';

FastlyPurge.prototype.url = function(url, options, callback) {
    if (!callback) {
        callback = options;
        options = {};
    }

    options = defaults(options, {
        softPurge: this._options.softPurge
    });

    request(
        {
            method: 'PURGE',
            url: url,
            headers: requestHeaders(options)
        },
        responseHandler(callback)
    );
};

FastlyPurge.prototype.service = function(serviceId, options, callback) {
    if (!callback) {
        callback = options;
        options = {};
    }

    options = extend(options, {
        apiKey: this._apiKey,
        accept: 'application/json'
    });

    request(
        {
            method: 'POST',
            url: fastlyUrl(format('/service/%s/purge_all', serviceId)),
            headers: requestHeaders(options)
        },
        responseHandler(callback)
    );
};

FastlyPurge.prototype.key = function(serviceId, key, options, callback) {
    if (!callback) {
        callback = options;
        options = {};
    }

    options = extend(
        defaults(options, {
            softPurge: this._options.softPurge
        }),
        {
            apiKey: this._apiKey,
            accept: 'application/json'
        }
    );

    request(
        {
            method: 'POST',
            url: fastlyUrl(format('/service/%s/purge/%s', serviceId, key)),
            headers: requestHeaders(options)
        },
        responseHandler(callback)
    );
};

function requestHeaders(options) {
    var headers = {};

    if (!!options.apiKey) {
        headers['Fastly-Key'] = options.apiKey;
    }

    if (!!options.softPurge) {
        headers['Fastly-Soft-Purge'] = 1;
    }

    if (!!options.accept) {
        headers.Accept = options.accept;
    }

    return headers;
}

function responseHandler(callback) {
    return function handler(err, response, body) {
        if (response && response.statusCode !== 200) {
            err = new Error(body || 'Empty response body');
            err.statusCode = response.statusCode;
        }
        if (err) {
            return callback(err);
        }

        if (response.headers['content-type'] === 'application/json') {
            try {
                body = JSON.parse(body);
            } catch (parseErr) {
                // ignore and return plain body
            }
        }

        return callback(null, body);
    };
}

function defaults(obj, def) {
    Object.keys(def).forEach(function(k) {
        if (!obj.hasOwnProperty(k)) {
            obj[k] = def[k];
        }
    });

    return obj;
}

function extend(obj, ext) {
    Object.keys(ext).forEach(function(k) {
        obj[k] = ext[k];
    });
    return obj;
}

function fastlyUrl(path) {
    return FASTLY_API_ENDPOINT + path;
}

import { getInput, setFailed } from '@actions/core';
import { create as createGlob } from '@actions/glob';

(async () => {
  try {
    const FASTLY_TOKEN = getInput('fastly-token');
    const FASTLY_URL = getInput('fastly-url');

    const purge = new FastlyPurge(FASTLY_TOKEN);
    const patterns = ['public/**/*.json', 'public/**/*.html', 'public/**/*.css', 'public/**/*.js', 'public/**/*.js.map', 'public/**/*.webp', 'public/**/*.svg', 'public/**/*.png', 'public/**/*.jpeg', 'public/**/*.jpg', 'public/**/*.gif'];
    const globber = await createGlob(patterns.join('\n'));

    const purgeURL = (url) => {
      return new Promise((res, rej) => {
        purge.url(url, {apiKey: FASTLY_TOKEN}, (err, result) => {
          if (result) res(result);
          if (err) rej(err);
        });
      });
    };

    const process = async (filePath = '') => {
      const fastlyURL = `${FASTLY_URL.endsWith('/') ? FASTLY_URL : `${FASTLY_URL}/`}${filePath}`;
      console.log(`Purging: ${fastlyURL}`);
      try {
        console.log(await purgeURL(fastlyURL));
      }
      catch (e) {
        console.warn(`Failed purging: ${fastlyURL}`);
        console.error(e);
      }
    };

    await process();

    for await (const file of globber.globGenerator()) {
      await process(file.substr(file.indexOf('/public/') + 8));
    }
  } catch (err) {
    setFailed(err);
  }
})();
