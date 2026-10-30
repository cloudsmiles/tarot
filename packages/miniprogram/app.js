App({
  globalData: {
    // 原型阶段由本地 H5 dev server 提供压缩牌图；上线换成 CDN/COS 地址即可。
    cardBaseUrl: 'http://127.0.0.1:5173/cards/',
  },
});
