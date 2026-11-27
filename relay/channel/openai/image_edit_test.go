package openai

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// TestConvertImageEditRequestMultipart verifies that ConvertImageRequest
// re-serializes multipart image edit requests with all fields (including
// stream) and the file intact, both when the form was already parsed and when
// it must be re-parsed from the reusable body.
func TestConvertImageEditRequestMultipart(t *testing.T) {
	gin.SetMode(gin.TestMode)

	newMultipartContext := func(t *testing.T, prompt, filenameSuffix string, image []byte) *gin.Context {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		require.NoError(t, writer.WriteField("model", "gpt-image-1"))
		require.NoError(t, writer.WriteField("prompt", prompt))
		require.NoError(t, writer.WriteField("stream", "true"))
		require.NoError(t, writer.WriteField("partial_images", "3"))
		part, err := writer.CreateFormFile("image", "input"+filenameSuffix)
		require.NoError(t, err)
		_, err = part.Write(image)
		require.NoError(t, err)
		require.NoError(t, writer.WriteField("complexity", "low"))
		for _, name := range []string{"mask", "markup"} {
			part, err := writer.CreateFormFile(name, name+filenameSuffix)
			require.NoError(t, err)
			_, err = part.Write([]byte("fake " + name))
			require.NoError(t, err)
		}
		require.NoError(t, writer.Close())

		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", &body)
		c.Request.Header.Set("Content-Type", writer.FormDataContentType())
		return c
	}

	convertAndReplay := func(t *testing.T, c *gin.Context, prompt, filenameSuffix string, image []byte, mimeType string) {
		info := &relaycommon.RelayInfo{
			RelayMode: relayconstant.RelayModeImagesEdits,
		}
		request := dto.ImageRequest{
			Model:  "gpt-image-1",
			Prompt: prompt,
			Stream: common.GetPointer(true),
		}

		converted, err := (&Adaptor{}).ConvertImageRequest(c, info, request)
		require.NoError(t, err)
		convertedBody, ok := converted.(*bytes.Buffer)
		require.True(t, ok)

		replayedRequest := httptest.NewRequest(http.MethodPost, "/v1/images/edits", bytes.NewReader(convertedBody.Bytes()))
		replayedRequest.Header.Set("Content-Type", c.Request.Header.Get("Content-Type"))
		require.NoError(t, replayedRequest.ParseMultipartForm(32<<20))

		require.Equal(t, "gpt-image-1", replayedRequest.PostForm.Get("model"))
		require.Equal(t, prompt, replayedRequest.PostForm.Get("prompt"))
		require.Equal(t, "true", replayedRequest.PostForm.Get("stream"))
		require.Equal(t, "3", replayedRequest.PostForm.Get("partial_images"))
		require.Len(t, replayedRequest.MultipartForm.File["image"], 1)
		require.Equal(t, "low", replayedRequest.PostForm.Get("complexity"))
		require.Len(t, replayedRequest.MultipartForm.File["mask"], 1)
		require.Len(t, replayedRequest.MultipartForm.File["markup"], 1)
		require.Equal(t, "input"+filenameSuffix, replayedRequest.MultipartForm.File["image"][0].Filename)
		for _, name := range []string{"mask", "markup"} {
			require.Equal(t, name+filenameSuffix, replayedRequest.MultipartForm.File[name][0].Filename)
		}
		t.Cleanup(func() { require.NoError(t, replayedRequest.MultipartForm.RemoveAll()) })

		file, err := replayedRequest.MultipartForm.File["image"][0].Open()
		require.NoError(t, err)
		defer file.Close()
		fileBytes, err := io.ReadAll(file)
		require.NoError(t, err)
		require.Equal(t, image, fileBytes)
		require.Equal(t, mimeType, replayedRequest.MultipartForm.File["image"][0].Header.Get("Content-Type"))
	}

	fakeImage := []byte("fake image")
	t.Run("with pre-parsed form", func(t *testing.T) {
		prompt := "edit this image"
		c := newMultipartContext(t, prompt, ".png", fakeImage)
		require.NoError(t, c.Request.ParseMultipartForm(32<<20))

		convertAndReplay(t, c, prompt, ".png", fakeImage, "image/png")
	})

	t.Run("re-parses reusable body when form is missing", func(t *testing.T) {
		prompt := "edit without pre-parsed form"
		c := newMultipartContext(t, prompt, ".png", fakeImage)

		storage, err := common.GetBodyStorage(c)
		require.NoError(t, err)
		c.Request.Body = io.NopCloser(storage)
		c.Request.MultipartForm = nil
		c.Request.PostForm = nil

		convertAndReplay(t, c, prompt, ".png", fakeImage, "image/png")
	})

	t.Run("quoted filenames survive multipart reconstruction", func(t *testing.T) {
		const suffix = `"quoted".png`
		prompt := "edit with a quoted filename"
		c := newMultipartContext(t, prompt, suffix, fakeImage)
		convertAndReplay(t, c, prompt, suffix, fakeImage, "image/png")
	})

	t.Run("webp keeps its MIME type and body", func(t *testing.T) {
		image, err := base64.StdEncoding.DecodeString("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==")
		require.NoError(t, err)
		require.Equal(t, "image/webp", http.DetectContentType(image))
		const prompt = "edit a WebP reference"
		c := newMultipartContext(t, prompt, ".webp", image)
		convertAndReplay(t, c, prompt, ".webp", image, "image/webp")
	})
}
