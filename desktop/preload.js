/**
 * 预加载脚本：只暴露「拿到拖入文件的真实路径」这一项能力
 * 浏览器出于安全拿不到本地路径，Electron 通过 webUtils 可以
 */
const { contextBridge, webUtils } = require('electron');

contextBridge.exposeInMainWorld('vshotDesktop', {
  isDesktop: true,
  electron: process.versions.electron,
  /** 传入 drop 事件里的 File 对象，返回磁盘绝对路径；失败返回空串 */
  getPathForFile(file) {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  }
});
