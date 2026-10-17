/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package controller

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const (
	wechatCallbackTimestampTolerance = 5 * time.Minute
	wechatCallbackMaxBodyBytes       = 256 * 1024
)

type wechatCallbackMessage struct {
	XMLName      xml.Name `xml:"xml"`
	ToUserName   string   `xml:"ToUserName"`
	FromUserName string   `xml:"FromUserName"`
	CreateTime   int64    `xml:"CreateTime"`
	MsgType      string   `xml:"MsgType"`
	Content      string   `xml:"Content"`
	MsgID        int64    `xml:"MsgId"`
	Encrypt      string   `xml:"Encrypt"`
}

type wechatTextReply struct {
	XMLName      xml.Name `xml:"xml"`
	ToUserName   string   `xml:"ToUserName"`
	FromUserName string   `xml:"FromUserName"`
	CreateTime   int64    `xml:"CreateTime"`
	MsgType      string   `xml:"MsgType"`
	Content      string   `xml:"Content"`
}

type wechatEncryptedReply struct {
	XMLName   xml.Name `xml:"xml"`
	Encrypt   string   `xml:"Encrypt"`
	Signature string   `xml:"MsgSignature"`
	Timestamp int64    `xml:"TimeStamp"`
	Nonce     string   `xml:"Nonce"`
}

func WeChatCallbackVerification(c *gin.Context) {
	if !validateWeChatCallbackTimestamp(c.Query("timestamp")) {
		c.String(http.StatusForbidden, "invalid timestamp")
		return
	}
	token := strings.TrimSpace(common.WeChatCallbackToken)
	nonce := c.Query("nonce")
	timestamp := c.Query("timestamp")
	echo := c.Query("echostr")
	if token == "" || nonce == "" || echo == "" {
		c.String(http.StatusForbidden, "invalid callback configuration")
		return
	}

	if c.Query("encrypt_type") == "aes" || c.Query("msg_signature") != "" {
		if !verifyWeChatSignature(c.Query("msg_signature"), token, timestamp, nonce, echo) {
			c.String(http.StatusForbidden, "invalid signature")
			return
		}
		plaintext, err := decryptWeChatPayload(echo, common.WeChatEncodingAESKey, common.WeChatAppID)
		if err != nil {
			c.String(http.StatusForbidden, "invalid encrypted payload")
			return
		}
		c.String(http.StatusOK, plaintext)
		return
	}

	if !verifyWeChatSignature(c.Query("signature"), token, timestamp, nonce) {
		c.String(http.StatusForbidden, "invalid signature")
		return
	}
	c.String(http.StatusOK, echo)
}

func WeChatCallback(c *gin.Context) {
	if !validateWeChatCallbackTimestamp(c.Query("timestamp")) {
		c.String(http.StatusForbidden, "invalid timestamp")
		return
	}
	token := strings.TrimSpace(common.WeChatCallbackToken)
	nonce := c.Query("nonce")
	timestamp := c.Query("timestamp")
	if token == "" || nonce == "" {
		c.String(http.StatusForbidden, "invalid callback configuration")
		return
	}

	body, err := io.ReadAll(io.LimitReader(c.Request.Body, wechatCallbackMaxBodyBytes+1))
	if err != nil || len(body) == 0 || len(body) > wechatCallbackMaxBodyBytes {
		c.String(http.StatusBadRequest, "invalid request body")
		return
	}
	var envelope wechatCallbackMessage
	if err := xml.Unmarshal(body, &envelope); err != nil {
		c.String(http.StatusBadRequest, "invalid XML")
		return
	}

	encrypted := strings.TrimSpace(envelope.Encrypt) != ""
	if encrypted {
		if !verifyWeChatSignature(c.Query("msg_signature"), token, timestamp, nonce, envelope.Encrypt) {
			c.String(http.StatusForbidden, "invalid signature")
			return
		}
		plaintext, err := decryptWeChatPayload(envelope.Encrypt, common.WeChatEncodingAESKey, common.WeChatAppID)
		if err != nil || xml.Unmarshal([]byte(plaintext), &envelope) != nil {
			c.String(http.StatusForbidden, "invalid encrypted payload")
			return
		}
	} else if !verifyWeChatSignature(c.Query("signature"), token, timestamp, nonce) {
		c.String(http.StatusForbidden, "invalid signature")
		return
	}

	if envelope.MsgType != "text" || !isWeChatVerificationKeyword(envelope.Content) {
		c.String(http.StatusOK, "success")
		return
	}
	code, err := service.IssueWeChatVerificationCode(c.Request.Context(), strings.TrimSpace(envelope.FromUserName))
	if err != nil {
		common.SysError(common.LogText("failed to issue WeChat verification code: %s", err.Error()))
		c.String(http.StatusInternalServerError, "temporary failure")
		return
	}
	replyBytes, err := xml.Marshal(wechatTextReply{
		ToUserName:   envelope.FromUserName,
		FromUserName: envelope.ToUserName,
		CreateTime:   time.Now().Unix(),
		MsgType:      "text",
		Content:      fmt.Sprintf("登录验证码：%s（3 分钟内有效，请勿转发）", code),
	})
	if err != nil {
		c.String(http.StatusInternalServerError, "temporary failure")
		return
	}

	if !encrypted {
		c.Data(http.StatusOK, "application/xml; charset=utf-8", replyBytes)
		return
	}
	encryptedReply, err := buildEncryptedWeChatReply(replyBytes, token)
	if err != nil {
		common.SysError(common.LogText("failed to encrypt WeChat callback response: %s", err.Error()))
		c.String(http.StatusInternalServerError, "temporary failure")
		return
	}
	c.Data(http.StatusOK, "application/xml; charset=utf-8", encryptedReply)
}

func isWeChatVerificationKeyword(content string) bool {
	switch strings.TrimSpace(content) {
	case "验证码", "驗證碼":
		return true
	default:
		return false
	}
}

func validateWeChatCallbackTimestamp(raw string) bool {
	timestamp, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return false
	}
	now := time.Now().Unix()
	tolerance := int64(wechatCallbackTimestampTolerance / time.Second)
	return timestamp >= now-tolerance && timestamp <= now+tolerance
}

func wechatSignature(parts ...string) string {
	sort.Strings(parts)
	hash := sha1.New()
	for _, part := range parts {
		_, _ = io.WriteString(hash, part)
	}
	return hex.EncodeToString(hash.Sum(nil))
}

func verifyWeChatSignature(signature string, parts ...string) bool {
	expected := wechatSignature(parts...)
	if len(signature) != len(expected) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(signature), []byte(expected)) == 1
}

func decodeWeChatEncodingAESKey(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, errors.New("EncodingAESKey is empty")
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimRight(value, "=") + "=")
	if err != nil || len(decoded) != 32 {
		return nil, errors.New("EncodingAESKey must decode to 32 bytes")
	}
	return decoded, nil
}

func decryptWeChatPayload(value string, encodingAESKey string, expectedAppID string) (string, error) {
	key, err := decodeWeChatEncodingAESKey(encodingAESKey)
	if err != nil {
		return "", err
	}
	ciphertext, err := base64.StdEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil || len(ciphertext) == 0 || len(ciphertext)%aes.BlockSize != 0 {
		return "", errors.New("invalid encrypted payload")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	plaintext := make([]byte, len(ciphertext))
	cipher.NewCBCDecrypter(block, key[:aes.BlockSize]).CryptBlocks(plaintext, ciphertext)
	plaintext, err = unpadWeChatPayload(plaintext)
	if err != nil || len(plaintext) < 20 {
		return "", errors.New("invalid encrypted payload")
	}
	messageLength := int(binary.BigEndian.Uint32(plaintext[16:20]))
	if messageLength < 0 || 20+messageLength > len(plaintext) {
		return "", errors.New("invalid encrypted payload length")
	}
	appID := plaintext[20+messageLength:]
	expected := []byte(strings.TrimSpace(expectedAppID))
	if len(expected) == 0 || len(appID) != len(expected) || subtle.ConstantTimeCompare(appID, expected) != 1 {
		return "", errors.New("encrypted payload AppID mismatch")
	}
	return string(plaintext[20 : 20+messageLength]), nil
}

func encryptWeChatPayload(value []byte, encodingAESKey string, appID string) (string, error) {
	key, err := decodeWeChatEncodingAESKey(encodingAESKey)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(appID) == "" {
		return "", errors.New("WeChat AppID is empty")
	}
	randomPrefix := make([]byte, 16)
	if _, err := rand.Read(randomPrefix); err != nil {
		return "", err
	}
	plaintext := make([]byte, 0, 20+len(value)+len(appID)+32)
	plaintext = append(plaintext, randomPrefix...)
	var messageLength [4]byte
	binary.BigEndian.PutUint32(messageLength[:], uint32(len(value)))
	plaintext = append(plaintext, messageLength[:]...)
	plaintext = append(plaintext, value...)
	plaintext = append(plaintext, appID...)
	plaintext = padWeChatPayload(plaintext)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	ciphertext := make([]byte, len(plaintext))
	cipher.NewCBCEncrypter(block, key[:aes.BlockSize]).CryptBlocks(ciphertext, plaintext)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func padWeChatPayload(value []byte) []byte {
	const blockSize = 32
	paddingLength := blockSize - len(value)%blockSize
	return append(value, bytes.Repeat([]byte{byte(paddingLength)}, paddingLength)...)
}

func unpadWeChatPayload(value []byte) ([]byte, error) {
	if len(value) == 0 {
		return nil, errors.New("invalid padding")
	}
	paddingLength := int(value[len(value)-1])
	if paddingLength < 1 || paddingLength > 32 || paddingLength > len(value) {
		return nil, errors.New("invalid padding")
	}
	var mismatch byte
	for _, char := range value[len(value)-paddingLength:] {
		mismatch |= char ^ byte(paddingLength)
	}
	if mismatch != 0 {
		return nil, errors.New("invalid padding")
	}
	return value[:len(value)-paddingLength], nil
}

func buildEncryptedWeChatReply(reply []byte, token string) ([]byte, error) {
	encrypted, err := encryptWeChatPayload(reply, common.WeChatEncodingAESKey, common.WeChatAppID)
	if err != nil {
		return nil, err
	}
	nonceBytes := make([]byte, 12)
	if _, err := rand.Read(nonceBytes); err != nil {
		return nil, err
	}
	nonce := hex.EncodeToString(nonceBytes)
	timestamp := time.Now().Unix()
	return xml.Marshal(wechatEncryptedReply{
		Encrypt:   encrypted,
		Signature: wechatSignature(token, strconv.FormatInt(timestamp, 10), nonce, encrypted),
		Timestamp: timestamp,
		Nonce:     nonce,
	})
}
