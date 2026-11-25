package controller

import (
	"bytes"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// JSON-only adaptors and task plugins can finish after an SSE heartbeat has
// already committed the response. Buffer their JSON while forwarding real
// streams, then use the ordinary image event renderer for the final result.
type playgroundImageResponseWriter struct {
	gin.ResponseWriter
	header http.Header
	status int
	body   bytes.Buffer
	stop   func()
}

func (w *playgroundImageResponseWriter) Header() http.Header {
	return w.header
}

func (w *playgroundImageResponseWriter) WriteHeader(status int) {
	w.stop()
	if status > 0 {
		w.status = status
	}
}

func (w *playgroundImageResponseWriter) Status() int {
	return w.status
}

func (w *playgroundImageResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *playgroundImageResponseWriter) WriteHeaderNow() {
	w.stop()
	if strings.HasPrefix(w.header.Get("Content-Type"), "application/json") {
		return
	}
	for key, values := range w.header {
		w.ResponseWriter.Header()[key] = values
	}
	w.ResponseWriter.WriteHeader(w.status)
	w.ResponseWriter.WriteHeaderNow()
}

func (w *playgroundImageResponseWriter) Write(data []byte) (int, error) {
	w.stop()
	if strings.HasPrefix(w.header.Get("Content-Type"), "application/json") {
		return w.body.Write(data)
	}
	w.WriteHeaderNow()
	return w.ResponseWriter.Write(data)
}

func (w *playgroundImageResponseWriter) WriteString(data string) (int, error) {
	return w.Write([]byte(data))
}

func (w *playgroundImageResponseWriter) Flush() {
	w.stop()
	if strings.HasPrefix(w.header.Get("Content-Type"), "application/json") {
		return
	}
	w.WriteHeaderNow()
	w.ResponseWriter.Flush()
}

func servePlaygroundImage(c *gin.Context) {
	var request struct {
		Stream bool `json:"stream"`
	}
	// The relay or plugin decoder owns request validation and its error format.
	stream := common.UnmarshalBodyReusable(c, &request) == nil && request.Stream
	stream = stream || common.GetContextKeyBool(c, constant.ContextKeyPlaygroundImageStream)
	handler := func(c *gin.Context) {
		RelayTaskPluginEndpoint(c, func(c *gin.Context) { Relay(c, types.RelayFormatOpenAIImage) })
	}
	if !stream {
		handler(c)
		return
	}
	streamPlaygroundImageResponse(c, handler)
}

func streamPlaygroundImageResponse(c *gin.Context, handler gin.HandlerFunc) {
	stop := helper.StartStreamKeepAlive(c, helper.DefaultPingInterval)
	original := c.Writer
	writer := &playgroundImageResponseWriter{
		ResponseWriter: original,
		header:         original.Header().Clone(),
		status:         http.StatusOK,
		stop:           stop,
	}
	// Gin's JSON renderer sets its content type only when it is absent. Keep
	// the live heartbeat headers separate so the renderer can identify JSON.
	writer.header.Del("Content-Type")
	c.Writer = writer
	defer func() {
		stop()
		c.Writer = original
	}()
	handler(c)
	stop()
	c.Writer = original
	if writer.body.Len() == 0 {
		return
	}
	for key, values := range writer.header {
		if key != "Content-Length" && key != "Content-Type" {
			original.Header()[key] = values
		}
	}
	original.Header().Del("Content-Length")
	if writer.status >= http.StatusBadRequest && !original.Written() {
		c.Header("Content-Type", "application/json")
		c.Data(writer.status, "application/json", writer.body.Bytes())
		return
	}
	c.Header("Content-Type", "text/event-stream")
	if gjson.GetBytes(writer.body.Bytes(), "error").Exists() {
		_ = helper.StringData(c, writer.body.String())
		helper.Done(c)
		return
	}
	if _, err := openai.WriteImageJSONStream(c, writer.body.Bytes(), nil); err != nil {
		logger.LogError(c, common.LogText("failed to write playground image response: %s", err.Error()))
	}
}
