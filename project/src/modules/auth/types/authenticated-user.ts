/** 请求上保留的身份。只含用户、会话和已核对的 tokenVersion，不含密码或权限快照。 */
export interface AuthenticatedUser {
  id: number;
  sessionId: number;
  tokenVersion: number;
}
