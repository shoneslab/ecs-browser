package main

import (
  "crypto/hmac"
  "crypto/md5"
  "crypto/sha1"
  "crypto/tls"
  "encoding/base64"
  "encoding/xml"
  "log"
  "sort"
  "strings"
  "net/url"
  "net/http"
  "strconv"
  "time"
  "bytes"
  "github.com/gorilla/mux"
  "github.com/gorilla/sessions"
  "io"
  "io/ioutil"
)

var b64 = base64.StdEncoding
// ----------------------------------------------------------------------------
// S3 signing (http://goo.gl/G1LrK)
var s3ParamsToSign = map[string]bool{
  "acl": true,
  "cors": true, // Due to an ECS bug
  "delete": true,
  "lifecycle": true,
  "location": true,
  "logging": true,
  "notification": true,
  "partNumber": true,
  "policy": true,
  "requestPayment": true,
  "torrent": true,
  "uploadId": true,
  "uploads": true,
  "versionId": true,
  "versioning": true,
  "versions": true,
  "response-content-type": true,
  "response-content-language": true,
  "response-expires": true,
  "response-cache-control": true,
  "response-content-disposition": true,
  "response-content-encoding": true,
  "searchmetadata": true,
  "query": true,
  "isstaleallowed": true,
}

type Bucket struct {
  Name string
}

type ListBucketsResp struct {
  Buckets []Bucket `xml:">Bucket"`
}

type Key struct {
  Key string
  LastModified string
  Size int64
  // ETag gives the hex-encoded MD5 sum of the contents,
  // surrounded with double-quotes.
  ETag string
  StorageClass string
}

type ListResp struct {
  Name string
  Prefix string
  Delimiter string
  Marker string
  NextMarker string
  MaxKeys int
  // IsTruncated is true if the results have been truncated because
  // there are more keys and prefixes than can fit in MaxKeys.
  // N.B. this is the opposite sense to that documented (incorrectly) in
  // http://goo.gl/YjQTc
  IsTruncated bool
  Contents []Key
  CommonPrefixes []string `xml:">Prefix"`
}

type VersionListResp struct {
  Name string
  Prefix string
  Delimiter string
  Marker string
  NextMarker string
  MaxKeys int
  // IsTruncated is true if the results have been truncated because
  // there are more keys and prefixes than can fit in MaxKeys.
  // N.B. this is the opposite sense to that documented (incorrectly) in
  // http://goo.gl/YjQTc
  IsTruncated bool
  Contents []Key
  CommonPrefixes []string `xml:">Prefix"`
}

type EntryList struct {
  ObjectName string `xml:"objectName"`
  Url string
  Metadatas []Metadata `xml:"queryMds>mdMap>entry"`
}

type Metadata struct {
	Key   string `xml:"key"`
	Value string `xml:"value"`
}

type BucketQueryResult struct {
  XMLName xml.Name `xml:"BucketQueryResult"`
  Name string `xml:"Name"`
  Marker string `xml:"Marker"`
  NextMarker string `xml:"NextMarker"`
  EntryLists []EntryList `xml:"ObjectMatches>object"`
}

type IndexableKey struct {
  Name string `xml:"Name"`
  Datatype string `xml:"Datatype"`
}

type BucketSearchMetadataResult struct {
  XMLName xml.Name `xml:"MetadataSearchList"`
  MetadataSearchEnabled bool `xml:"MetadataSearchEnabled"`
  IndexableKeys []IndexableKey `xml:"IndexableKeys>Key"`
}

type Person struct {
  ID string `xml:"ID"`
  Type string `xml:"type,attr"`
  DisplayName string `xml:"DisplayName"`
}

type Grant struct {
  Grantee Person `xml:"Grantee"`
  Permission string `xml:"Permission"`
}

type AclResponse struct {
  XMLName xml.Name `xml:"AccessControlPolicy"`
  Owner Person `xml:"Owner"`
  Grants []Grant `xml:"AccessControlList>Grant"`
}

type S3 struct {
  EndPointString string
  AccessKey string
  SecretKey string
  Token string
  Namespace string
}

type EndPoint struct {
  UrlString string
  Scheme string
  Host string
  Port int
  Path string
  RawQuery string
}

type PreparedS3Request struct {
  Url string
  Params map[string][]string
}

var s3store = sessions.NewCookieStore([]byte("session-key"))

// make a generic S3 request
func S3Passthrough(w http.ResponseWriter, r *http.Request) *appError {
  s3, err := GetS3(r)
  if err != nil {
    return &appError{err: err, status: http.StatusInternalServerError, json: http.StatusText(http.StatusInternalServerError)}
  }
  var passthroughMethod string
  headers := make(map[string][]string)
  for key, value := range r.Header {
  	if (key == "X-Passthrough-Method") {
  	  passthroughMethod = value[0]
  	} else {
      headers[key] = value
  	}
  }
  vars := mux.Vars(r)
  var bucket = vars["bucket"]
  var object = vars["object"]
  path := "/"
  if (len(strings.TrimSpace(object)) > 0) {
    path = path + object
  }
  separator := "?"
  for key, values := range r.URL.Query() {
    for _, value := range values {
      path = path + separator + key + "=" + value
      separator = "&"
    }
  }
  var data = ""
  var response Response
  if (passthroughMethod == "POST") {
    buffer, err := ioutil.ReadAll(r.Body)
    if (err != nil) {
      return &appError{err: err, status: http.StatusInternalServerError, json: http.StatusText(http.StatusInternalServerError)}
    }
    data = string(buffer)
  } else if (passthroughMethod == "PUT") {
    file, _, err := r.FormFile("file")
    if err != nil {
      buffer, err := ioutil.ReadAll(r.Body)
      if (err != nil) {
        return &appError{err: err, status: http.StatusInternalServerError, json: http.StatusText(http.StatusInternalServerError)}
      }
      data = string(buffer)
    } else {
      var Buf bytes.Buffer
      defer file.Close()
      io.Copy(&Buf, file)
      data = string(Buf.Bytes())
      Buf.Reset()
    }
  }
  response, err = s3Request(s3, bucket, passthroughMethod, path, headers, data)
  var passthroughResponse PassthroughResponse
  passthroughResponse.Code = response.Code
  passthroughResponse.Body = response.Body
  passthroughResponse.ResponseHeaders = make(map[string]string)
  for key, values := range response.ResponseHeaders {
  	fullValue := ""
  	separator := ""
    for _, value := range values {
      fullValue = fullValue + separator + value
      separator = ", "
    }
    passthroughResponse.ResponseHeaders[key] = fullValue
  }
  rendering.JSON(w, http.StatusOK, passthroughResponse)
  return nil
}

// make a generic S3 request
func S3Passthrough2(w http.ResponseWriter, r *http.Request) *appError {
  log.Print("Starting S3Passthrough2")
  var passthroughMethod string
  var passthroughNamespace string
  var passthroughEndpoint string
  var passthroughAccessKey string
  var passthroughSecretKey string

  headers := make(map[string][]string)
  for key, value := range r.Header {
  	if (key == "X-Passthrough-Method") {
  	  passthroughMethod = value[0]
  	} else if (key == "X-Passthrough-Namespace") {
  	  passthroughNamespace = value[0]
  	} else if (key == "X-Passthrough-Endpoint") {
  	  passthroughEndpoint = value[0]
  	} else if (key == "X-Passthrough-Key") {
  	  passthroughAccessKey = value[0]
  	} else if (key == "X-Passthrough-Secret") {
  	  passthroughSecretKey = value[0]
  	} else {
      headers[key] = value
  	}
  }

  s3 := S3{
    EndPointString: passthroughEndpoint,
    AccessKey: passthroughAccessKey,
    SecretKey: passthroughSecretKey,
    Namespace: passthroughNamespace,
  }

  vars := mux.Vars(r)
  var bucket = vars["bucket"]
  var object = vars["object"]
  path := "/"
  if (len(strings.TrimSpace(object)) > 0) {
    path = path + object
  }
  separator := "?"
  specialKey := "";
  for key, values := range r.URL.Query() {
    for _, value := range values {
  	  if (key == "acl") {
  	    specialKey = key;
  	  }
      path = path + separator + key + "=" + value
      separator = "&"
    }
  }
  var data = ""
  var response Response
  if (passthroughMethod == "POST") {
    buffer, err := ioutil.ReadAll(r.Body)
    if (err != nil) {
      return &appError{err: err, status: http.StatusInternalServerError, json: http.StatusText(http.StatusInternalServerError)}
    }
    data = string(buffer)
  } else if (passthroughMethod == "PUT") {
  	log.Print("Receiving file or Body")
    file, _, err := r.FormFile("file")
    if err != nil {
      log.Print("Reading body after error: " + err.Error())
      buffer, err := ioutil.ReadAll(r.Body)
      if (err != nil) {
        return &appError{err: err, status: http.StatusInternalServerError, json: http.StatusText(http.StatusInternalServerError)}
      }
      data = string(buffer)
    } else {
      log.Print("Received file with following data")
      var Buf bytes.Buffer
      defer file.Close()
      io.Copy(&Buf, file)
      data = string(Buf.Bytes())
      log.Print(data)
      log.Print("    >> end of data")
      Buf.Reset()
    }
  }
  response, _ = s3Request(s3, bucket, passthroughMethod, path, headers, data)

  var jsonBody interface{}
  if (len(strings.TrimSpace(bucket)) == 0) {
    jsonBody = &ListBucketsResp{}
  } else if (len(strings.TrimSpace(object)) == 0) {
  	if (specialKey == "acl") {
      jsonBody = &AclResponse{}
  	} else {
      jsonBody = &ListResp{}
  	}
  } else {
  	if (specialKey == "acl") {
      jsonBody = &AclResponse{}
  	}
  }
  xml.NewDecoder(strings.NewReader(response.Body)).Decode(jsonBody)
  log.Print(response.Body);

  var passthroughResponse PassthroughResponse2
  passthroughResponse.Code = response.Code
  passthroughResponse.Body = jsonBody
  passthroughResponse.ResponseHeaders = make(map[string]string)
  for key, values := range response.ResponseHeaders {
  	fullValue := ""
  	separator := ""
    for _, value := range values {
      fullValue = fullValue + separator + value
      separator = ", "
    }
    passthroughResponse.ResponseHeaders[key] = fullValue
  }
  rendering.JSON(w, http.StatusOK, passthroughResponse)
  return nil
}

// Returned an S3 struct to be used to execute S3 requests
func GetS3(r *http.Request) (S3, error) {
  session, err := s3store.Get(r, "session-name")
  if err != nil {
    return S3{}, err
  }
  var namespace = r.Header.Get("X-Passthrough-Namespace")
  s3 := S3{
    EndPointString: session.Values["Endpoint"].(string),
    AccessKey: session.Values["AccessKey"].(string),
    SecretKey: session.Values["SecretKey"].(string),
    Namespace: namespace,
  }
  return s3, nil
}

func prepareS3Request(s3 S3, bucket string, method string, pathWithParams string, headers map[string][]string, namespaceInHost bool) (PreparedS3Request, error) {
  endPoint, err := parseEndPoint(s3.EndPointString)
  if err != nil {
    return PreparedS3Request{}, err
  }

  pathWithParamsList := strings.Split(pathWithParams, "?")
  path := pathWithParams
  query := ""

  params := make(map[string][]string)
  if len(pathWithParamsList) > 1 {
    path = pathWithParamsList[0]
    query = pathWithParamsList[1]
    for _, param := range strings.Split(query, "&") {
      kv := strings.Split(param, "=")
      if len(kv) > 1 {
        params[kv[0]] = []string{kv[1]}
      } else {
        params[kv[0]] = []string{""}
      }
    }
  }

  if path[:1] != "/" {
    path = "/" + path
  }

  if bucket != "" && ! namespaceInHost {
    path = "/" + bucket + path
  }

  if _, ok := params["Expires"]; ok {

  } else {
    headers["x-amz-date"] = []string{time.Now().UTC().Format(time.RFC1123)}
  }

  /*
  if s3.Namespace != "" && ! strings.HasPrefix(canonicalPath, "/" + s3.Namespace) && namespaceInHost {
    canonicalPath = "/" + s3.Namespace + canonicalPath +
  }
  */

  host := endPoint.Host
  canonicalPath := path

  if s3.Namespace != "" {
    if namespaceInHost {
      host = bucket + "." + s3.Namespace + "." + host
      canonicalPath = "/" + bucket + path
    } else {
      headers["x-emc-namespace"] = []string{s3.Namespace}
    }
  }

  headers["host"] = []string{host}

  sign(s3, method, canonicalPath, params, headers)

  url := endPoint.Scheme + "://" + host + ":" + strconv.Itoa(endPoint.Port)
  url += path

  if query != "" {
    url += "?" + query
  }

  preparedS3Request := PreparedS3Request{
    Url: url,
    Params: params,
  }
  return preparedS3Request, nil
}

func s3Request(s3 S3, bucket string, method string, path string, headers map[string][]string, body string) (Response, error) {
  if body != "" {
    hash := md5.Sum([]byte(body))
    headers["Content-MD5"] = []string{b64.EncodeToString(hash[:])}
    log.Print("Hash: " + b64.EncodeToString(hash[:]))
  }

  preparedS3Request, err := prepareS3Request(s3, bucket, method, path, headers, false)

  if body != "" {
    headers["Content-Length"] = []string{strconv.Itoa(len(body))}
  }
  u, _ := url.Parse(preparedS3Request.Url)
  parameters, _ := url.ParseQuery(u.RawQuery)
  u.RawQuery = parameters.Encode()
  if err != nil {
    return Response{}, err
  }
  tr := &http.Transport{
    TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
  }
  httpClient := &http.Client{Transport: tr}
  req, err := http.NewRequest(method, u.String(), bytes.NewBufferString(body))
  if err != nil {
    return Response{}, err
  }

  for key, values := range headers {
    for _, value := range values {
      req.Header.Add(key, value);
    }
  }
  resp, err := httpClient.Do(req)
  if err != nil {
    return Response{}, err
  }

  buf := new(bytes.Buffer)
  buf.ReadFrom(resp.Body)
  data := buf.String()
  response := Response{
    Code: resp.StatusCode,
    Body: data,
    RequestHeaders: req.Header,
    ResponseHeaders: resp.Header,
  }
  return response, nil
}

func parseEndPoint(urlString string) (EndPoint, error){
  url, err := url.Parse(urlString)
  if err != nil {
    return EndPoint{}, err
  }
  hostPort := strings.Split(url.Host,":")
  host := hostPort[0]
  port := 80
  if len(hostPort) > 1 {
    port, _ = strconv.Atoi(hostPort[1])
  } else {
    if url.Scheme == "https" {
      port = 443
    }
  }
  endPoint := EndPoint{
    UrlString: urlString,
    Scheme: url.Scheme,
    Host: host,
    Port: port,
    Path: url.Path,
    RawQuery: url.RawQuery,
  }
  return endPoint, nil
}

func sign(s3 S3, method, canonicalPath string, params, headers map[string][]string) {
  debug := false
  var md5, ctype, date, xamz string
  var xamzDate bool
  var sarray []string
  // add security token
  if s3.Token != "" {
    headers["x-amz-security-token"] = []string{s3.Token}
  }
  if s3.SecretKey == "" {
    // no auth secret; skip signing, e.g. for public read-only buckets.
    return
  }
  for k, v := range headers {
    k = strings.ToLower(k)
    switch k {
      case "content-md5":
      md5 = v[0]
      case "content-type":
      ctype = v[0]
      case "date":
      if !xamzDate {
        date = v[0]
      }
      default:
      if strings.HasPrefix(k, "x-amz-") || strings.HasPrefix(k, "x-emc-") {
        vall := strings.Join(v, ",")
        sarray = append(sarray, k+":"+vall)
        if k == "x-amz-date" {
          xamzDate = true
          date = ""
        }
      }
    }
  }
  if len(sarray) > 0 {
    sort.StringSlice(sarray).Sort()
    xamz = strings.Join(sarray, "\n") + "\n"
  }
  expires := false
  if v, ok := params["Expires"]; ok {
    // Query string request authentication alternative.
    expires = true
    date = v[0]
    params["AWSAccessKeyId"] = []string{s3.AccessKey}
  }
  sarray = sarray[0:0]
  for k, v := range params {
    if s3ParamsToSign[k] {
      for _, vi := range v {
        if vi == "" {
          sarray = append(sarray, k)
        } else {
          // "When signing you do not encode these values."
          sarray = append(sarray, k+"="+vi)
        }
      }
    }
  }
  if len(sarray) > 0 {
    sort.StringSlice(sarray).Sort()
    canonicalPath = canonicalPath + "?" + strings.Join(sarray, "&")
  }
  payload := method + "\n" + md5 + "\n" + ctype + "\n" + date + "\n" + xamz + canonicalPath
  hash := hmac.New(sha1.New, []byte(s3.SecretKey))
  hash.Write([]byte(payload))
  signature := make([]byte, b64.EncodedLen(hash.Size()))
  b64.Encode(signature, hash.Sum(nil))
  if expires {
    params["Signature"] = []string{string(signature)}
  } else {
    headers["Authorization"] = []string{"AWS " + s3.AccessKey + ":" + string(signature)}
  }
  if debug {
    log.Printf("Signature payload: %q", payload)
    log.Printf("Signature: %q", signature)
  }
}

// amazonShouldEscape returns true if byte should be escaped
func amazonShouldEscape(c byte) bool {
  return !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
  (c >= '0' && c <= '9') || c == '_' || c == '-' || c == '~' || c == '.' || c == '/' || c == ':')
}
// amazonEscape does uri escaping exactly as Amazon does
func amazonEscape(s string) string {
  hexCount := 0
  for i := 0; i < len(s); i++ {
    if amazonShouldEscape(s[i]) {
      hexCount++
    }
  }
  if hexCount == 0 {
    return s
  }
  t := make([]byte, len(s)+2*hexCount)
  j := 0
  for i := 0; i < len(s); i++ {
    if c := s[i]; amazonShouldEscape(c) {
      t[j] = '%'
      t[j+1] = "0123456789ABCDEF"[c>>4]
      t[j+2] = "0123456789ABCDEF"[c&15]
      j += 3
      } else {
      t[j] = s[i]
      j++
    }
  }
  return string(t)
}
