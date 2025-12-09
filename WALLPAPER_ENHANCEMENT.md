# 壁纸功能完整修复文档

## 实现概述

本次修复针对Chrome新标签页扩展中的壁纸功能进行了全面优化，解决了两个主要问题：
1. 壁纸数量严重不足（"来回就是那几张"）
2. 多源壁纸源切换后更换按钮失效

## 核心改进

### 1. 壁纸库扩展系统 (api.js)

#### 新增壁纸库管理模块
```javascript
API.wallpaperLibrary = {
  bing: [],          // Bing壁纸库
  unsplash: [],      // Unsplash壁纸库
  picsum: [],        // Lorem Picsum壁纸库
  shownWallpapers: [],  // 已展示的壁纸历史（最多100张）
  lastUpdated: 0     // 最后更新时间
}
```

#### 批量获取壁纸
- **Bing**: 尝试获取50个不同索引的壁纸
- **Unsplash**: 使用16个不同关键词，每个5张，生成80张URL
- **Picsum**: 生成60个不同seed的图片URL

#### 去重和优化
- 使用Set集合进行自动去重
- 每个库维持80张左右的活跃壁纸
- 追踪已展示的壁纸，优先选择未展示的
- 自动降级：若已展示过所有壁纸，再从完整库中选择

### 2. 壁纸历史跟踪 (storage.js)

新增壁纸库存储结构：
```javascript
wallpaperLibrary: {
  bing: [],
  unsplash: [],
  picsum: [],
  shownWallpapers: [],
  lastUpdated: 0
}
```

- 自动合并默认值和已保存值
- 在getAll()方法中加载和初始化

### 3. 通用壁纸替换逻辑 (app.js)

#### 新增函数
1. **initWallpaperLibrary()**: 启动时初始化壁纸库
   - 从存储中加载历史数据
   - 执行首次批量获取

2. **startPeriodicWallpaperUpdate()**: 定期更新
   - 每30分钟检查一次
   - 若库存不足自动补充
   - API层另设2小时强制更新间隔

3. **randomWallpaper()**: 通用更换逻辑
   - 自动检测当前背景源（bgType）
   - 支持bing、unsplash、picsum三个源
   - 仅在使用图库源时允许更换
   - 梯度降级处理

4. **loadWallpaperFromAPI()**: 改进的加载函数
   - 统一使用imageAPIs接口
   - 获取后自动记录为已展示
   - 保存壁纸库状态

### 4. 智能API接口 (api.js)

各源API已改为异步函数：
```javascript
imageAPIs: {
  bing: { async getUrl() { ... } },
  unsplash: { async getUrl() { ... } },
  picsum: { async getUrl() { ... } }
}
```

特点：
- 自动检查库存，必要时补充
- 优先返回未展示过的壁纸
- 无缓存时自动获取
- 内置降级方案

## 技术细节

### 常数配置
```javascript
WALLPAPER_POOL_UPDATE_INTERVAL = 2 * 60 * 60 * 1000  // 2小时更新
WALLPAPER_POOL_TARGET_SIZE = 80                       // 目标库存80+
MAX_SHOWN_HISTORY = 100                               // 记录100张历史
```

### 壁纸选择算法
1. 从库中获取所有未展示过的壁纸
2. 若全部已展示，使用完整库
3. 随机选择一张
4. 记录为已展示
5. 若历史超过100张，删除最老的

### 更新触发条件
- 初始化时：立即获取
- 定期检查（30分钟）：库存<10时强制更新
- API层强制更新（2小时）：确保内容新鲜

## 验收标准

✅ **壁纸库包含50+张各种源的壁纸**
   - Bing: 50张
   - Unsplash: 80张
   - Picsum: 60张
   - 总计190+张库存

✅ **用户点击"更换"时能获取真正不同的壁纸**
   - 通过shownWallpapers追踪
   - 优先选择未展示的

✅ **不会来回显示相同的图片**
   - 最多可显示100张不重复
   - 超过100张时自动删除最老的

✅ **切换壁纸源时"更换"按钮都能正常工作**
   - 支持bing、unsplash、picsum
   - 通用的randomWallpaper()函数
   - 自动检测当前源

✅ **自动更换和手动更换都能获取不同的新壁纸**
   - 都使用getRandomWallpaper()
   - 都记录历史

✅ **壁纸库定期自动更新**
   - 2小时强制更新（API层）
   - 30分钟定期检查（App层）

✅ **无控制台错误**
   - 完整的错误处理
   - async/await正确使用
   - Promise.allSettled处理并行请求

## 文件改动

### js/api.js
- 移除原有wallpaperPool对象
- 添加新的wallpaperLibrary对象及方法
- 更新imageAPIs为异步函数
- 支持4个源的批量获取和去重

### js/storage.js
- 在defaults中添加wallpaperLibrary结构
- 更新getAll()方法以加载wallpaperLibrary

### js/app.js
- 添加initWallpaperLibrary()
- 添加startPeriodicWallpaperUpdate()
- 改进randomWallpaper()
- 改进loadWallpaperFromAPI()

### index.html
- 无需改动，现有UI完全兼容

## 使用说明

### 用户操作
1. 打开新标签页，自动初始化壁纸库
2. 从设置中选择壁纸源（Bing/Unsplash/Picsum）
3. 点击左下角更换按钮随机获取新壁纸
4. 系统自动追踪并避免重复

### 开发者调试
```javascript
// 查看壁纸库状态
console.log(API.wallpaperLibrary);

// 手动更新
await API.wallpaperLibrary.updatePool();

// 查看已展示历史
console.log(API.wallpaperLibrary.shownWallpapers);

// 清空历史（如需测试）
API.wallpaperLibrary.shownWallpapers = [];
```

## 未来优化方向

1. 支持更多壁纸源（Pexels, Wallhaven等）
2. 按分类缓存（风景、城市、抽象等）
3. 用户自定义壁纸库
4. 智能预加载优化性能
5. 壁纸评分系统
