package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relay/channel/replicate"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPlaygroundImagePinsPluginAndPreservesSelectedGroup(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	previousCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = false
	t.Cleanup(func() { common.MemoryCacheEnabled = previousCacheEnabled })
	source := strings.Replace(imageProtocolTestPlugin,
		"decodeRequest: function(ctx) {",
		`decodeRequest: function(ctx) { if (ctx.stream || ctx.body.value.stream) throw new Error("stream is not supported");`, 1)
	_, err := pluginruntime.DefaultRegistry.Register(source, pluginruntime.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, pluginruntime.DefaultRegistry.Unregister("image-bridge")) })
	pluginChannel := &model.Channel{Id: 601, Type: constant.ChannelTypeTaskPlugin, Status: common.ChannelStatusEnabled, Group: "vip", Models: "image-model", Key: "test-key"}
	pluginChannel.SetSetting(dto.ChannelSettings{TaskPluginKey: "image-bridge"})
	require.NoError(t, db.Create(pluginChannel).Error)
	require.NoError(t, db.Create(&model.Channel{Id: 602, Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Group: "vip", Models: "gpt-image-2", Key: "test-key"}).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "vip", Model: "image-model", ChannelId: 601, Enabled: true},
		{Group: "vip", Model: "gpt-image-2", ChannelId: 602, Enabled: true},
	}).Error)
	for _, tc := range []struct {
		name, model string
		claimed     bool
		native      bool
	}{
		{name: "claimed image", model: "image-model", claimed: true},
		{name: "ordinary image", model: "gpt-image-2"},
		{name: "native protocol still rejects streaming", model: "image-model", claimed: true, native: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := "/pg/images/generations"
			if tc.native {
				path = "/v1/images/generations"
			}
			engine := gin.New()
			engine.Use(func(c *gin.Context) {
				common.SetContextKey(c, constant.ContextKeyUsingGroup, "vip")
				common.SetContextKey(c, constant.ContextKeyUserGroup, "vip")
				c.Next()
			})
			engine.POST(path, middleware.PinTaskPluginEndpoint(), middleware.PrepareTaskPluginEndpoint(), middleware.Distribute(), func(c *gin.Context) {
				assert.Equal(t, path, c.Request.URL.Path)
				value, exists := c.Get(pluginruntime.ContextKeyPinnedEndpoint)
				require.Equal(t, tc.claimed, exists)
				if tc.claimed {
					assert.Equal(t, 601, c.GetInt("channel_id"))
					pinned := value.(pluginruntime.PinnedEndpoint)
					assert.Equal(t, pluginruntime.ProtocolOpenAIImage, pinned.Protocol)
					assert.Equal(t, "image-model", pinned.Model)
					request := c.MustGet(pluginruntime.ContextKeyProtocolRequest).(pluginruntime.ProtocolRequestContext)
					assert.False(t, request.Stream)
					assert.True(t, common.GetContextKeyBool(c, constant.ContextKeyPlaygroundImageStream))
					assert.Equal(t, false, request.Body.(map[string]any)["value"].(map[string]any)["stream"])
					assert.Equal(t, "a cat", request.Body.(map[string]any)["value"].(map[string]any)["prompt"])
					assert.Equal(t, "vip", request.Body.(map[string]any)["value"].(map[string]any)["group"])
					// An invalid bridge context must produce a protocol failure,
					// rather than sending this claimed model to the Go adaptor.
					c.Set(pluginruntime.ContextKeyProtocolRequest, nil)
				} else {
					assert.Equal(t, 602, c.GetInt("channel_id"))
				}
				RelayTaskPluginEndpoint(c, func(c *gin.Context) { c.Status(http.StatusNoContent) })
			})
			request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"`+tc.model+`","group":"vip","prompt":"a cat","stream":true}`))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, request)
			if tc.native {
				assert.Equal(t, http.StatusBadRequest, recorder.Code)
				assert.Contains(t, recorder.Body.String(), "stream is not supported")
				return
			}
			if tc.claimed {
				assert.Equal(t, http.StatusInternalServerError, recorder.Code)
				assert.Contains(t, recorder.Body.String(), "task_protocol_error")
			} else {
				assert.Equal(t, http.StatusNoContent, recorder.Code)
			}
		})
	}
}

func TestPlaygroundImageJSONAfterHeartbeatDeliversReplicateImages(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	streamPlaygroundImageResponse(c, func(c *gin.Context) {
		require.NoError(t, helper.PingData(c))
		response := &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"status":"succeeded","output":["https://example.com/one.png","https://example.com/two.png"]}`)),
		}
		_, apiErr := (&replicate.Adaptor{}).DoResponse(c, response, &relaycommon.RelayInfo{Request: &dto.ImageRequest{}})
		require.Nil(t, apiErr)
	})
	assert.Equal(t, "text/event-stream", recorder.Result().Header.Get("Content-Type"))
	assert.Equal(t, 2, strings.Count(recorder.Body.String(), "event: image_generation.completed"))
	assert.Contains(t, recorder.Body.String(), `"url":"https://example.com/one.png"`)
	assert.Contains(t, recorder.Body.String(), `"url":"https://example.com/two.png"`)
	assert.True(t, strings.HasSuffix(recorder.Body.String(), "data: [DONE]\n\n"))
}

func TestPlaygroundImageJSONContentLengthDoesNotTruncateStream(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	streamPlaygroundImageResponse(c, func(c *gin.Context) {
		response := &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}}
		service.IOCopyBytesGracefully(c, response, []byte(`{"data":{"url":"https://example.com/result.png"}}`))
	})
	assert.Empty(t, recorder.Result().Header.Get("Content-Length"))
	assert.Equal(t, "text/event-stream", recorder.Result().Header.Get("Content-Type"))
	assert.Contains(t, recorder.Body.String(), `"url":"https://example.com/result.png"`)
	assert.True(t, strings.HasSuffix(recorder.Body.String(), "data: [DONE]\n\n"))
}

func TestPlaygroundImageErrorsPreserveStatusBeforeHeartbeatAndSSEAfterIt(t *testing.T) {
	for _, heartbeat := range []bool{false, true} {
		name := "before heartbeat"
		if heartbeat {
			name = "after heartbeat"
		}
		t.Run(name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
			streamPlaygroundImageResponse(c, func(c *gin.Context) {
				if heartbeat {
					require.NoError(t, helper.PingData(c))
				}
				c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "invalid image prompt", "code": "invalid_request"}})
			})
			assert.Contains(t, recorder.Body.String(), "invalid image prompt")
			if heartbeat {
				assert.Equal(t, http.StatusOK, recorder.Code)
				assert.Equal(t, "text/event-stream", recorder.Result().Header.Get("Content-Type"))
				assert.Contains(t, recorder.Body.String(), "data: {\"error\":")
				assert.Contains(t, recorder.Body.String(), "data: [DONE]")
			} else {
				assert.Equal(t, http.StatusBadRequest, recorder.Code)
				assert.Contains(t, recorder.Result().Header.Get("Content-Type"), "application/json")
				assert.NotContains(t, recorder.Body.String(), "data:")
			}
		})
	}
}

func TestPlaygroundImageExistingSSEPassesThrough(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	const payload = `{"type":"image_generation.completed","b64_json":"iVBORw0KGgo="}`
	streamPlaygroundImageResponse(c, func(c *gin.Context) {
		require.NoError(t, helper.StringData(c, payload))
		helper.Done(c)
	})
	assert.Equal(t, "text/event-stream", recorder.Result().Header.Get("Content-Type"))
	assert.Equal(t, "data: "+payload+"\n\ndata: [DONE]\n\n", recorder.Body.String())
}
