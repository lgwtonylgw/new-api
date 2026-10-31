package system_setting

import (
	"errors"
	"net/url"
	"strings"
)

var ServerAddress = "http://localhost:3000"
var ApiPublicAddress = ""
var TaskPublicAddress = ""
var WorkerUrl = ""
var WorkerValidKey = ""
var WorkerAllowHttpImageRequestEnabled = false

// NormalizeAPIPublicAddress accepts a gateway root or path prefix, not a
// protocol endpoint. An empty value preserves the ServerAddress fallback.
func NormalizeAPIPublicAddress(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed == nil ||
		(parsed.Scheme != "https" && parsed.Scheme != "http") ||
		parsed.Hostname() == "" || parsed.User != nil || parsed.Opaque != "" ||
		parsed.RawQuery != "" || parsed.ForceQuery || strings.ContainsAny(value, "#\\\r\n\t") {
		return "", errors.New("Enter an absolute HTTP(S) URL without credentials, query parameters, or fragments")
	}
	return strings.TrimRight(value, "/"), nil
}

func EnableWorker() bool {
	return WorkerUrl != ""
}
