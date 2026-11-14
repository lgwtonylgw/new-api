package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const oauthRegistrationPurpose = "oauth_registration"

// Only server-verified identity and profile fields survive the provider round
// trip. Passwords and provider access tokens must never enter the flow payload.
type oauthRegistrationPayload struct {
	Subject     string `json:"subject"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
	InviterID   int    `json:"inviter_id"`
}

func startOAuthRegistration(c *gin.Context, provider, name, subject string, user *model.User) {
	if subject == "" || user == nil || user.Id != 0 {
		writeSecurityOperationError(c, model.ErrAuthFlowInvalid)
		return
	}
	payload, err := common.Marshal(oauthRegistrationPayload{
		Subject: subject, Username: user.Username, DisplayName: user.DisplayName,
		Email: user.Email, InviterID: user.InviterId,
	})
	if err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	expiresAt := time.Now().Add(oauthAuthFlowTTL)
	token, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose: oauthRegistrationPurpose, Provider: provider, Intent: model.AuthFlowIntentLogin,
		Payload: string(payload), ExpiresAt: expiresAt,
	})
	if err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	setAuthNoStore(c)
	common.ApiSuccess(c, gin.H{
		"require_registration": true, "flow_token": token, "expires_at": expiresAt.Unix(),
		"provider_name": name, "username": user.Username, "email": user.Email,
	})
}

// createOAuthUserWithTx serializes new registrations for the same identity and
// never turns a registration grant into permission to change an existing user.
// Both the password completion and password-disabled path use this transaction.
func createOAuthUserWithTx(tx *gorm.DB, provider oauth.Provider, subject string, user *model.User) error {
	if user.Id != 0 || subject == "" {
		return model.ErrAuthFlowInvalid
	}
	column := "wechat_id"
	if provider != nil {
		column = provider.ProviderUserIDColumn()
	}
	var count int64
	var query *gorm.DB
	if custom, ok := provider.(*oauth.GenericOAuthProvider); ok {
		column = "custom:" + strconv.Itoa(custom.GetProviderId())
		query = tx.Model(&model.UserOAuthBinding{}).Where("provider_id = ? AND provider_user_id = ?", custom.GetProviderId(), subject)
	} else {
		// The column comes from a registered server-side provider, never a request.
		query = tx.Unscoped().Model(&model.User{}).Where(column+" = ?", subject)
	}
	// The stable assertion claim also covers two different pending grants for
	// the same subject, including providers whose users column is not unique.
	if err := model.ClaimExternalAuthAssertionWithTx(tx, oauthRegistrationPurpose, column+":"+subject, time.Now().Add(oauthAuthFlowTTL)); err != nil {
		return err
	}
	if err := query.Count(&count).Error; err != nil {
		return err
	}
	if count != 0 {
		return model.ErrAuthFlowInvalid
	}
	if provider == nil {
		user.WeChatId = subject
	} else {
		provider.SetProviderUserID(user, subject)
	}
	if err := user.InsertWithTx(tx, user.InviterId); err != nil {
		return err
	}
	if custom, ok := provider.(*oauth.GenericOAuthProvider); ok {
		return model.CreateUserOAuthBindingWithTx(tx, &model.UserOAuthBinding{
			UserId: user.Id, ProviderId: custom.GetProviderId(), ProviderUserId: subject,
		})
	}
	if column == "telegram_id" {
		return model.ClaimExternalIdentityWithTx(tx, model.ExternalIdentityProviderTelegram, subject, user.Id)
	}
	return nil
}

func CompleteOAuthRegistration(c *gin.Context) {
	setAuthNoStore(c)
	if !common.RegisterEnabled {
		common.ApiErrorT(c, "New user registration has been disabled by administrator")
		return
	}
	if !common.PasswordLoginEnabled {
		common.ApiErrorT(c, "Password login has been disabled by administrator")
		return
	}
	var request struct {
		FlowToken       string `json:"flow_token"`
		Password        string `json:"password"`
		ConfirmPassword string `json:"confirm_password"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || request.FlowToken == "" || request.Password != request.ConfirmPassword {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	if err := common.ValidateNewAccountPassword(request.Password); err != nil {
		common.ApiError(c, err)
		return
	}
	flow, err := model.GetAuthFlow(request.FlowToken, model.AuthFlowMatch{Purpose: oauthRegistrationPurpose, Intent: model.AuthFlowIntentLogin})
	if err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	provider := oauth.GetProvider(flow.Provider)
	if flow.Provider == "wechat" {
		if !common.WeChatAuthEnabled {
			common.ApiErrorT(c, "{{provider}} login and registration has not been enabled by administrator", providerParams("WeChat"))
			return
		}
		provider = nil
	} else if provider == nil || !provider.IsEnabled() {
		writeSecurityOperationError(c, model.ErrAuthFlowInvalid)
		return
	}
	var payload oauthRegistrationPayload
	if err := common.UnmarshalJsonStr(flow.Payload, &payload); err != nil || payload.Subject == "" || payload.Username == "" {
		writeSecurityOperationError(c, model.ErrAuthFlowInvalid)
		return
	}
	user := &model.User{
		Username: payload.Username, DisplayName: payload.DisplayName, Email: payload.Email,
		InviterId: payload.InviterID, Password: request.Password,
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled,
	}
	_, err = model.ConsumeAuthFlowWithAction(request.FlowToken, model.AuthFlowMatch{
		Purpose: oauthRegistrationPurpose, Provider: flow.Provider, Intent: model.AuthFlowIntentLogin,
	}, func(tx *gorm.DB, _ *model.AuthFlow) error {
		return createOAuthUserWithTx(tx, provider, payload.Subject, user)
	})
	if err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	user.FinalizeOAuthUserCreation(user.InviterId)
	method := "oauth:" + flow.Provider
	if flow.Provider == "wechat" {
		method = "wechat"
	}
	c.Set("login_method", method)
	c.Set("role", user.Role)
	recordUserSecurityAudit(c, user.Id, "user.password_change", map[string]any{"first_password": true, "provider": flow.Provider, "success": true})
	setupLogin(user, nil, c)
}
