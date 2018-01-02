/*
 * Copyright 2017 EMC Corporation. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 * http://www.apache.org/licenses/LICENSE-2.0.txt
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */
function isNonEmptyString(theString) {
  return (theString && theString.trim() && (theString != ""));
};

function combineWithSlash( part1, part2 ) {
  var combination;
  if (!isNonEmptyString(part2)) {
    combination = part1;
  } else if (part2.startsWith('/')) {
    if (part1.endsWith('/')) {
      combination = part1 + part2.substring(1);
    } else {
      combination = part1 + part2;
    }
  } else if (part1.endsWith('/')) {
    combination = part1 + part2;
  } else {
    combination = part1 + '/' + part2;
  }
  return combination;
};

function handleData( data, callback, dataProcessor ) {
  if ( data.status && ( ( data.status >= 200 ) && ( data.status < 300 ) ) ) {
    if (dataProcessor) {
      data = dataProcessor( data );
    }
    callback( null, data );
  } else {
    handleError( callback, data, null, null );
  }
};

function handleError ( callback, data, errorThrown, textStatus ) {
  if ( !data.status ) {
    data = {
      status: 418,
      statusText: "No server found"
    };
  }
  callback( { status: data.status, errorThrown: errorThrown, message: data.statusText }, null );
};

var _metadataStart = 'x-amz-meta-';

function getErrorMessage( status ) {
  if ( ( status >= 200 ) && ( status < 300 ) ) {
    return "Success!";
  } else if ( status == 400 ) {
    return "Bad Request";
  } else if ( status == 401 ) {
    return "Unauthorized";
  } else if ( status == 402 ) {
    return "Payment Required";
  } else if ( status == 403 ) {
    return "Forbidden";
  } else if ( status == 404 ) {
    return "Not Found";
  } else if ( status == 405 ) {
    return "Method Not Allowed";
  } else if ( status == 406 ) {
    return "Not Acceptable";
  } else if ( status == 407 ) {
    return "Proxy Authentication Required";
  } else if ( status == 408 ) {
    return "Request Timeout";
  } else if ( status == 409 ) {
    return "Conflict";
  } else if ( status == 410 ) {
    return "Gone";
  } else if ( status == 413 ) {
    return "Payload Too Large";
  } else if ( status == 500 ) {
    return "Internal Server Error";
  } else if ( status == 501 ) {
    return "Not Implemented";
  } else if ( status == 502 ) {
    return "Bad Gateway";
  } else if ( status == 503 ) {
    return "Service Unavailable";
  } else if ( status == 504 ) {
    return "Gateway Timeout";
  } else if ( status == 505 ) {
    return "HTTP Version Not Supported";
  } else if ( status == 507 ) {
    return "Insufficient Storage";
  } else if ( status == 511 ) {
    return "Network Authentication Required";
  } else {
    return "Failure";
  }
};

function makeMetaData( data ) {
  var metaData = {};
  if (data && data.headers) {
    for (var key in data.headers) {
      if (data.headers.hasOwnProperty(key)) {
        if (!key.toLowerCase().startsWith(_metadataStart)) {
          metaData[ keyProcessor(key) ] = data.headers[key];
        } else {
          if (!metaData.Metadata) {
            metaData.Metadata = {};
          }
          metaData.Metadata[ key.substring(_metadataStart.length) ] = data.headers[key];
        }
      }
    }
  }
  return metaData;
};

function keyProcessor( key ) {
  var processedKey = '';
  var afterGap = false;
  for (var i = 0, keyLength = key.length; i < keyLength; ++i) {
    var theCharacter = key[i];
    if (characterBetweenInclusive(theCharacter, 'a', 'z') ||
        characterBetweenInclusive(theCharacter, 'A', 'Z') || 
        characterBetweenInclusive(theCharacter, '0', '9')) {
      if (processedKey === '') {
        theCharacter = theCharacter.toLowerCase();
      }
      processedKey = processedKey + theCharacter;
    }
  }
  return processedKey;
};

function characterBetweenInclusive( theCharacter, startCharacter, endCharacter ) {
  return (theCharacter >= startCharacter) && (theCharacter <= endCharacter);
};

function getEcsBody( data ) {
  return data.body;
};

EcsS3 = function( s3Params ) {
    this.endpoint = s3Params.endpoint;
    this.accessKeyId = s3Params.accessKeyId;
    this.secretAccessKey = s3Params.secretAccessKey;
    this.sslEnabled = s3Params.sslEnabled;
    this.s3ForcePathStyle = s3Params.s3ForcePathStyle;
    this.configuration = s3Params;
};

EcsS3.prototype.headAnything = function( objectParams, callback ) {
    var apiUrl = this.getObjectApiUrl(objectParams);
    var headers = this.getHeaders('HEAD');
    var processData = function( data ) {
        if (!data.headers) {
          return data;
        }
        var metaData = makeMetaData(data);
        metaData.type = FileRow.ENTRY_TYPE.REGULAR;
        return metaData;
    };
    $.ajax({ url: apiUrl,  method: 'POST', headers: headers,
        success: function(data, textStatus, jqHXR) {
            handleData( data, callback, processData );
        },
        error: function(jqHXR, textStatus, errorThrown) {
            handleError( callback,  jqHXR, errorThrown, textStatus );
        },
    });
};

EcsS3.prototype.listBuckets = function(callback ) {
    var apiUrl = this.getSystemApiUrl();
    var headers = this.getHeaders('GET');
    
    $.ajax({ url: apiUrl,  method: 'POST', headers: headers,
        success: function(data, textStatus, jqHXR) {
            handleData( data, callback, getEcsBody );
        },
        error: function(jqHXR, textStatus, errorThrown) {
            handleError( callback,  jqHXR, errorThrown, textStatus );
        },
    });

};

EcsS3.prototype.listObjects = function( bucketParams, callback ) {
    var apiUrl = this.getBucketApiUrl(bucketParams);
    var separatorChar = '?';
    if (isNonEmptyString(bucketParams.Delimiter)) {
      apiUrl = apiUrl + separatorChar + 'delimiter=' + bucketParams.Delimiter;
      separatorChar = '&';
    };
    if (isNonEmptyString(bucketParams.Prefix)) {
      apiUrl = apiUrl + separatorChar + 'prefix=' + bucketParams.Prefix;
      separatorChar = '&';
    };
    if (isNonEmptyString(bucketParams.ExtraQueryParameters)) {
      apiUrl = apiUrl + separatorChar + bucketParams.ExtraQueryParameters;
      separatorChar = '&';
    };
    var headers = this.getHeaders('GET');
    
    $.ajax({ url: apiUrl,  method: 'POST', headers: headers,
        success: function(data, textStatus, jqHXR) {
            handleData( data, callback, getEcsBody );
        },
        error: function(jqHXR, textStatus, errorThrown) {
            handleError( callback,  jqHXR, errorThrown, textStatus );
        },
    });
};

EcsS3.prototype.getBucketAcl = function( bucketParams, callback ) {
    var apiUrl = this.getBucketApiUrl(bucketParams) + '?acl';
    var headers = this.getHeaders('GET');
    
    $.ajax({ url: apiUrl,  method: 'POST', headers: headers,
        success: function(data, textStatus, jqHXR) {
            handleData( data, callback, getEcsBody );
        },
        error: function(jqHXR, textStatus, errorThrown) {
            handleError( callback,  jqHXR, errorThrown, textStatus );
        },
    });
};

EcsS3.prototype.getObjectAcl = function( objectParams, callback ) {
    var apiUrl = this.getObjectApiUrl(objectParams) + '?acl';
    var headers = this.getHeaders('GET');
    
    $.ajax({ url: apiUrl,  method: 'POST', headers: headers,
        success: function(data, textStatus, jqHXR) {
            handleData( data, callback, getEcsBody );
        },
        error: function(jqHXR, textStatus, errorThrown) {
            handleError( callback,  jqHXR, errorThrown, textStatus );
        },
    });
};

EcsS3.prototype.putObject = function( objectParams, callback ) {
    var apiUrl = this.getObjectApiUrl(objectParams);
    var headers = this.getHeaders('PUT');
    if (objectParams.Headers) {
      for (var key in objectParams.Headers) {
        headers[key] = objectParams.Headers[key];
      }
    }
    var data = objectParams.Body ? objectParams.Body : '';
    var contentType = objectParams.Body ? data.type : 'application/octet-stream';
    if (!isNonEmptyString(contentType)) {
       contentType = 'multipart/form-data';
    }
    $.ajax({ url: apiUrl,  method: 'POST', headers: headers, data: data, processData: false, contentType: contentType,
        success: function(data, textStatus, jqHXR) {
            handleData( data, callback );
        },
        error: function(jqHXR, textStatus, errorThrown) {
            handleError( callback,  jqHXR, errorThrown, textStatus );
        },
    });
};

EcsS3.prototype.copyObject = function( objectParams, callback ) {
    var apiUrl = this.getObjectApiUrl(objectParams);
    var headers = this.getHeaders('PUT');
    var copySource = objectParams.CopySource;
    if (!copySource.startsWith('/')) {
      copySource = '/' + copySource;
    }
    headers['X-amz-copy-source'] = copySource;
    if (objectParams.Metadata) {
      for (var key in objectParams.Metadata) {
        if (objectParams.Metadata.hasOwnProperty(key)) {
          headers[_metadataStart + key] = objectParams.Metadata[key];
        }
      }
    }
    if (isNonEmptyString(objectParams.MetadataDirective)) {
        headers['X-amz-metadata-directive'] = objectParams.MetadataDirective;
    }
    
    $.ajax({ url: apiUrl,  method: 'POST', headers: headers,
        success: function(data, textStatus, jqHXR) {
            handleData( data, callback );
        },
        error: function(jqHXR, textStatus, errorThrown) {
            handleError( callback,  jqHXR, errorThrown, textStatus );
        },
    });
};


EcsS3.prototype.deleteObject = function( objectParams, callback ) {
    var apiUrl = this.getObjectApiUrl(objectParams);
    var headers = this.getHeaders('DELETE');
    
    $.ajax({ url: apiUrl,  method: 'POST', headers: headers,
        success: function(data, textStatus, jqHXR) {
            handleData( data, callback );
        },
        error: function(jqHXR, textStatus, errorThrown) {
            handleError( callback,  jqHXR, errorThrown, textStatus );
        },
    });
};

EcsS3.prototype.getServiceInformation = function( callback ) {
    var apiUrl = this.getSystemApiUrl() + '?endpoint';
    var headers = this.getHeaders('GET');
    function wrappedCallback( error, data ) {
        callback( data );
    };

    $.ajax({ url: apiUrl,  method: 'POST', headers: headers,
        success: function(data, textStatus, jqHXR) {
            handleData( data, wrappedCallback, makeEcsServiceInformation );
        },
        error: function(jqHXR, textStatus, errorThrown) {
            handleError( wrappedCallback,  jqHXR, errorThrown, textStatus );
        },
    });
};

function makeEcsServiceInformation( data ) {
    return { successful: true,
        object: true,
        version: data.body.versionInfo };
};

EcsS3.prototype.getHeaders = function( passthroughMethod ) {
    var headers = {
        'X-Passthrough-Endpoint': this.endpoint,
        'X-Passthrough-Key': this.accessKeyId,
        'X-Passthrough-Secret': this.secretAccessKey,
        'X-Passthrough-Method': passthroughMethod,
        'Accept': 'application/json',
        'Content-Type': 'application/octet-stream'
    };
    return headers;
};

EcsS3.prototype.getSystemApiUrl = function() {
    return window.location.protocol + '//' + window.location.host + '/service/proxy';
};

EcsS3.prototype.getBucketApiUrl = function( params ) {
    return combineWithSlash( this.getSystemApiUrl(), params.Bucket );
};

EcsS3.prototype.getObjectApiUrl = function( params ) {
    return combineWithSlash( this.getBucketApiUrl( params ), params.Key );
};

