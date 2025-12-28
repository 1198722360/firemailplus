package handlers

import (
	"net/http"

	"firemail/internal/models"
	"firemail/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PublicEmailAuthRequest 公开查件认证请求
type PublicEmailAuthRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// PublicGetEmailsRequest 公开查件请求
type PublicGetEmailsRequest struct {
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required"`
	Page      int    `json:"page"`
	PageSize  int    `json:"page_size"`
	SortBy    string `json:"sort_by"`
	SortOrder string `json:"sort_order"`
	Search    string `json:"search"`
	FolderID  *uint  `json:"folder_id"`
}

// PublicSyncAndGetEmailsRequest 公开同步并查件请求
type PublicSyncAndGetEmailsRequest struct {
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required"`
	Page      int    `json:"page"`
	PageSize  int    `json:"page_size"`
	SortBy    string `json:"sort_by"`
	SortOrder string `json:"sort_order"`
	Search    string `json:"search"`
}

// authenticateByEmailPassword 通过邮箱+密码验证并获取账户
func (h *Handler) authenticateByEmailPassword(email, password string) (*models.EmailAccount, error) {
	var account models.EmailAccount

	// 通过邮箱地址查找账户
	result := h.db.Where("email = ? AND password = ?", email, password).First(&account)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, result.Error
		}
		return nil, result.Error
	}

	return &account, nil
}

// PublicVerifyEmailAccount 验证邮箱账户（公开接口）
func (h *Handler) PublicVerifyEmailAccount(c *gin.Context) {
	var req PublicEmailAuthRequest
	if !h.bindJSON(c, &req) {
		return
	}

	account, err := h.authenticateByEmailPassword(req.Email, req.Password)
	if err != nil {
		h.respondWithError(c, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	h.respondWithSuccess(c, gin.H{
		"valid":      true,
		"account_id": account.ID,
		"email":      account.Email,
		"name":       account.Name,
		"provider":   account.Provider,
	})
}

// PublicGetEmails 公开查件接口（通过邮箱+密码鉴权）
func (h *Handler) PublicGetEmails(c *gin.Context) {
	var req PublicGetEmailsRequest
	if !h.bindJSON(c, &req) {
		return
	}

	// 验证邮箱+密码
	account, err := h.authenticateByEmailPassword(req.Email, req.Password)
	if err != nil {
		h.respondWithError(c, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	// 设置默认值
	if req.Page <= 0 {
		req.Page = 1
	}
	if req.PageSize <= 0 {
		req.PageSize = 20
	}
	if req.SortBy == "" {
		req.SortBy = "date"
	}
	if req.SortOrder == "" {
		req.SortOrder = "desc"
	}

	// 验证分页参数
	req.Page, req.PageSize = h.validatePagination(req.Page, req.PageSize)

	// 验证排序参数
	req.SortBy, req.SortOrder = h.validateSortParams(req.SortBy, req.SortOrder)

	// 构建查询请求
	emailReq := &services.GetEmailsRequest{
		AccountID:   &account.ID,
		FolderID:    req.FolderID,
		Page:        req.Page,
		PageSize:    req.PageSize,
		SortBy:      req.SortBy,
		SortOrder:   req.SortOrder,
		SearchQuery: req.Search,
	}

	// 获取邮件列表（使用账户所属的 UserID）
	response, err := h.emailService.GetEmails(c.Request.Context(), account.UserID, emailReq)
	if err != nil {
		h.respondWithError(c, http.StatusInternalServerError, "Failed to get emails")
		return
	}

	h.respondWithSuccess(c, response)
}

// PublicSyncAndGetEmails 公开同步并查件接口
func (h *Handler) PublicSyncAndGetEmails(c *gin.Context) {
	var req PublicSyncAndGetEmailsRequest
	if !h.bindJSON(c, &req) {
		return
	}

	// 验证邮箱+密码
	account, err := h.authenticateByEmailPassword(req.Email, req.Password)
	if err != nil {
		h.respondWithError(c, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	// 先同步邮件
	if err := h.syncService.SyncEmails(c.Request.Context(), account.ID); err != nil {
		// 同步失败时记录但继续返回已有邮件
		// 可以在响应中添加警告信息
	}

	// 设置默认值
	if req.Page <= 0 {
		req.Page = 1
	}
	if req.PageSize <= 0 {
		req.PageSize = 20
	}
	if req.SortBy == "" {
		req.SortBy = "date"
	}
	if req.SortOrder == "" {
		req.SortOrder = "desc"
	}

	// 验证分页参数
	req.Page, req.PageSize = h.validatePagination(req.Page, req.PageSize)

	// 验证排序参数
	req.SortBy, req.SortOrder = h.validateSortParams(req.SortBy, req.SortOrder)

	// 构建查询请求
	emailReq := &services.GetEmailsRequest{
		AccountID:   &account.ID,
		Page:        req.Page,
		PageSize:    req.PageSize,
		SortBy:      req.SortBy,
		SortOrder:   req.SortOrder,
		SearchQuery: req.Search,
	}

	// 获取邮件列表
	response, err := h.emailService.GetEmails(c.Request.Context(), account.UserID, emailReq)
	if err != nil {
		h.respondWithError(c, http.StatusInternalServerError, "Failed to get emails")
		return
	}

	h.respondWithSuccess(c, response)
}

// PublicGetEmailDetail 公开获取邮件详情
func (h *Handler) PublicGetEmailDetail(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
		EmailID  uint   `json:"email_id" binding:"required"`
	}
	if !h.bindJSON(c, &req) {
		return
	}

	// 验证邮箱+密码
	account, err := h.authenticateByEmailPassword(req.Email, req.Password)
	if err != nil {
		h.respondWithError(c, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	// 获取邮件详情
	email, err := h.emailService.GetEmail(c.Request.Context(), account.UserID, req.EmailID)
	if err != nil {
		h.respondWithError(c, http.StatusNotFound, "Email not found")
		return
	}

	// 验证邮件属于该账户
	if email.AccountID != account.ID {
		h.respondWithError(c, http.StatusForbidden, "Email does not belong to this account")
		return
	}

	h.respondWithSuccess(c, email)
}
