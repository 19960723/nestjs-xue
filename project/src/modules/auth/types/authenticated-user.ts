/** 请求上保留的身份。只有用户 ID 和会话 ID，不含密码、角色或权限快照。 */
export interface AuthenticatedUser {
  id: number;
  sessionId: number;
}
