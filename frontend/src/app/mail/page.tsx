'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080/api/v1';

// localStorage key for storing credentials
const STORAGE_KEY = 'public_mail_credentials';

interface Email {
  id: number;
  subject: string;
  from: string; // 后端返回的是 "from" 字段，格式可能是 "Name <email>" 或 JSON
  to: string;
  date: string;
  preview?: string;
  text_body?: string;
  html_body?: string;
  is_read: boolean;
  is_starred: boolean;
}

interface EmailListResponse {
  emails: Email[];
  total: number;
  page: number;
  page_size: number;
}

// 解析发件人信息
function parseFromField(from: string): { name: string; address: string } {
  if (!from) return { name: '', address: '' };

  // 尝试解析 JSON 格式 (如 {"name":"xxx","address":"xxx@xxx.com"})
  try {
    const parsed = JSON.parse(from);
    if (parsed && typeof parsed === 'object') {
      return {
        name: parsed.name || '',
        address: parsed.address || parsed.email || '',
      };
    }
  } catch {
    // 不是 JSON，继续尝试其他格式
  }

  // 尝试解析 "Name <email@address.com>" 格式
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ''),
      address: match[2].trim(),
    };
  }

  // 如果只是纯邮箱地址
  if (from.includes('@')) {
    return { name: '', address: from.trim() };
  }

  return { name: from, address: '' };
}

// 解析收件人信息
function parseToField(to: string): string[] {
  if (!to) return [];

  // 尝试解析 JSON 数组格式
  try {
    const parsed = JSON.parse(to);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return item.address || item.email || '';
        }
        return '';
      }).filter(Boolean);
    }
  } catch {
    // 不是 JSON，按逗号分隔
  }

  return to.split(',').map((addr) => addr.trim()).filter(Boolean);
}

export default function PublicMailPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoLogging, setIsAutoLogging] = useState(true);
  const [error, setError] = useState('');
  const [emails, setEmails] = useState<Email[]>([]);
  const [totalEmails, setTotalEmails] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const pageSize = 20;

  // 页面加载时尝试自动登录
  useEffect(() => {
    const savedCredentials = localStorage.getItem(STORAGE_KEY);
    if (savedCredentials) {
      try {
        const { email: savedEmail, password: savedPassword } = JSON.parse(savedCredentials);
        if (savedEmail && savedPassword) {
          setEmail(savedEmail);
          setPassword(savedPassword);
          // 自动登录
          autoLogin(savedEmail, savedPassword);
          return;
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsAutoLogging(false);
  }, []);

  const autoLogin = async (savedEmail: string, savedPassword: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/public/emails/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: savedEmail, password: savedPassword }),
      });

      const data = await response.json();

      if (data.success) {
        setIsLoggedIn(true);
        loadEmailsWithCredentials(savedEmail, savedPassword, 1);
      } else {
        // 自动登录失败，清除保存的凭据
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsAutoLogging(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/public/emails/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        // 保存凭据到 localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, password }));
        setIsLoggedIn(true);
        loadEmails(1);
      } else {
        setError(data.message || '邮箱或密码错误');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const loadEmailsWithCredentials = async (
    emailAddr: string,
    pwd: string,
    page: number,
    sync = false
  ) => {
    setIsLoading(true);
    try {
      const endpoint = sync ? '/public/emails/sync-and-list' : '/public/emails/list';
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailAddr,
          password: pwd,
          page,
          page_size: pageSize,
          sort_by: 'date',
          sort_order: 'desc',
        }),
      });

      const data = await response.json();

      if (data.success) {
        const result = data.data as EmailListResponse;
        setEmails(result.emails || []);
        setTotalEmails(result.total || 0);
        setCurrentPage(page);
      } else {
        setError(data.message || '加载邮件失败');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const loadEmails = async (page: number, sync = false) => {
    loadEmailsWithCredentials(email, password, page, sync);
  };

  const loadEmailDetail = async (emailId: number) => {
    setIsLoadingDetail(true);
    try {
      const response = await fetch(`${API_BASE_URL}/public/emails/detail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          email_id: emailId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSelectedEmail(data.data as Email);
      } else {
        setError(data.message || '加载邮件详情失败');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleLogout = () => {
    // 清除保存的凭据
    localStorage.removeItem(STORAGE_KEY);
    setIsLoggedIn(false);
    setEmail('');
    setPassword('');
    setEmails([]);
    setSelectedEmail(null);
    setError('');
  };

  // 格式化日期时间（完整格式，包含秒）
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const totalPages = Math.ceil(totalEmails / pageSize) || 1;

  // 自动登录加载中
  if (isAutoLogging) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
        <div className="text-center text-white">
          <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div>正在自动登录...</div>
        </div>
      </div>
    );
  }

  // 登录界面
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 py-12 px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 px-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                邮件查询
              </h1>
              <p className="text-gray-500 dark:text-gray-400">输入邮箱和密码查看邮件</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  邮箱地址
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  邮箱密码
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入邮箱密码"
                  required
                  className="w-full"
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    验证中...
                  </div>
                ) : (
                  '查看邮件'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 邮件详情模态框
  const EmailDetailModal = () => {
    if (!selectedEmail) return null;

    const fromInfo = parseFromField(selectedEmail.from);
    const toAddresses = parseToField(selectedEmail.to);

    return (
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={() => setSelectedEmail(null)}
      >
        <div
          className="bg-white dark:bg-gray-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b dark:border-gray-700 flex justify-between items-start">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 pr-4">
              {selectedEmail.subject || '(无主题)'}
            </h2>
            <button
              onClick={() => setSelectedEmail(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
            >
              &times;
            </button>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400">
            <p>
              <strong>发件人：</strong>
              {fromInfo.name
                ? `${fromInfo.name} <${fromInfo.address}>`
                : fromInfo.address || '未知发件人'}
            </p>
            <p>
              <strong>收件人：</strong>
              {toAddresses.length > 0 ? toAddresses.join(', ') : '-'}
            </p>
            <p>
              <strong>时间：</strong>
              {formatDateTime(selectedEmail.date)}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : selectedEmail.html_body ? (
              <div
                className="prose dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedEmail.html_body }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300">
                {selectedEmail.text_body || '邮件内容为空'}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  };

  // 邮件列表界面
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* 顶部栏 */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
              {email.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{email}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">共 {totalEmails} 封邮件</div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => loadEmails(currentPage, true)}
              disabled={isLoading}
            >
              {isLoading ? '同步中...' : '同步邮件'}
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              退出
            </Button>
          </div>
        </div>
      </div>

      {/* 邮件列表 */}
      <div className="max-w-6xl mx-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading && emails.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <div className="text-gray-500 dark:text-gray-400">正在加载邮件...</div>
                </div>
              </div>
            ) : emails.length === 0 ? (
              <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                <div className="text-5xl mb-4">📭</div>
                <div>暂无邮件</div>
              </div>
            ) : (
              <div className="divide-y dark:divide-gray-700">
                {emails.map((item) => {
                  const fromInfo = parseFromField(item.from);
                  const senderDisplay = fromInfo.name || fromInfo.address || '未知发件人';

                  return (
                    <div
                      key={item.id}
                      onClick={() => loadEmailDetail(item.id)}
                      className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                        !item.is_read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            item.is_read
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                              : 'bg-indigo-500 text-white'
                          }`}
                        >
                          {item.is_read ? '📧' : '📩'}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <div
                              className={`font-medium truncate ${
                                item.is_read
                                  ? 'text-gray-700 dark:text-gray-300'
                                  : 'text-gray-900 dark:text-gray-100'
                              }`}
                            >
                              {senderDisplay}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0 whitespace-nowrap">
                              {formatDateTime(item.date)}
                            </div>
                          </div>

                          <div
                            className={`text-sm truncate mb-1 ${
                              item.is_read
                                ? 'text-gray-600 dark:text-gray-400'
                                : 'text-gray-900 dark:text-gray-100 font-medium'
                            }`}
                          >
                            {item.subject || '(无主题)'}
                          </div>

                          <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {item.preview || item.text_body?.substring(0, 100) || ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-4">
            <Button
              variant="outline"
              onClick={() => loadEmails(currentPage - 1)}
              disabled={currentPage <= 1 || isLoading}
            >
              上一页
            </Button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              第 {currentPage} / {totalPages} 页
            </span>
            <Button
              variant="outline"
              onClick={() => loadEmails(currentPage + 1)}
              disabled={currentPage >= totalPages || isLoading}
            >
              下一页
            </Button>
          </div>
        )}
      </div>

      {/* 邮件详情模态框 */}
      <EmailDetailModal />
    </div>
  );
}
