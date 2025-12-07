// API 统一管理模块
const RECOMMENDATION_CACHE_WINDOW = 3 * 60 * 60 * 1000;

const API = {
  // 图库 API
  imageAPIs: {
    unsplash: {
      name: 'Unsplash',
      getUrl: (category = 'nature') => `https://source.unsplash.com/1920x1080/?${category}&t=${Date.now()}`
    },
    picsum: {
      name: 'Lorem Picsum',
      getUrl: () => `https://picsum.photos/1920/1080?t=${Date.now()}`
    },
    bing: {
      name: '必应每日',
      getUrl: async () => {
        try {
          const res = await fetch('https://bing.biturl.top/?resolution=1920&format=json&index=0&mkt=zh-CN');
          const data = await res.json();
          return data.url;
        } catch {
          return 'https://picsum.photos/1920/1080';
        }
      }
    }
  },

  // 渐变预设
  gradientPresets: [
    { name: '极光紫', colors: ['#667eea', '#764ba2'] },
    { name: '海洋蓝', colors: ['#2193b0', '#6dd5ed'] },
    { name: '日落橙', colors: ['#ee0979', '#ff6a00'] },
    { name: '森林绿', colors: ['#134e5e', '#71b280'] },
    { name: '薰衣草', colors: ['#a18cd1', '#fbc2eb'] },
    { name: '烈焰红', colors: ['#f12711', '#f5af19'] },
    { name: '深海蓝', colors: ['#0f0c29', '#302b63', '#24243e'] },
    { name: '蜜桃粉', colors: ['#ffecd2', '#fcb69f'] },
    { name: '薄荷绿', colors: ['#00b09b', '#96c93d'] },
    { name: '暗夜黑', colors: ['#232526', '#414345'] },
    { name: '樱花粉', colors: ['#ff9a9e', '#fecfef'] },
    { name: '天空蓝', colors: ['#56ccf2', '#2f80ed'] },
    { name: '葡萄紫', colors: ['#8e2de2', '#4a00e0'] },
    { name: '柠檬黄', colors: ['#f7971e', '#ffd200'] },
    { name: '极地冰', colors: ['#e6dada', '#274046'] },
    { name: '珊瑚橙', colors: ['#ff9966', '#ff5e62'] },
    { name: '星空', colors: ['#0f2027', '#203a43', '#2c5364'] },
    { name: '彩虹', colors: ['#f093fb', '#f5576c'] },
    { name: '翡翠绿', colors: ['#11998e', '#38ef7d'] },
    { name: '玫瑰金', colors: ['#f4c4f3', '#fc67fa'] },
    { name: '冰川', colors: ['#c9d6ff', '#e2e2e2'] },
    { name: '热带', colors: ['#00f260', '#0575e6'] },
    { name: '秋叶', colors: ['#d38312', '#a83279'] },
    { name: '午夜', colors: ['#0f0c29', '#302b63'] }
  ],

  // 获取位置
  async getLocation() {
    const apis = [
      { url: 'https://ipapi.co/json/', parse: d => ({ city: d.city || '未知', lat: parseFloat(d.latitude), lon: parseFloat(d.longitude) }) },
      { url: 'http://ip-api.com/json/', parse: d => ({ city: d.city || '未知', lat: parseFloat(d.lat), lon: parseFloat(d.lon) }) }
    ];

    for (const api of apis) {
      try {
        const res = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const data = await res.json();
        const loc = api.parse(data);
        if (loc.lat && loc.lon) return loc;
      } catch { continue; }
    }
    return { city: '北京', lat: 39.9, lon: 116.4 };
  },

  // 获取天气
  async getWeather(lat, lon) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();

      if (!data.current) return null;

      return {
        temp: Math.round(data.current.temperature_2m),
        humidity: data.current.relative_humidity_2m,
        windSpeed: Math.round(data.current.wind_speed_10m),
        condition: this.getWeatherCondition(data.current.weather_code),
        icon: this.getWeatherIcon(data.current.weather_code),
        forecast: data.daily?.time.slice(0, 3).map((date, i) => ({
          date: this.formatDate(date),
          maxTemp: Math.round(data.daily.temperature_2m_max[i]),
          minTemp: Math.round(data.daily.temperature_2m_min[i]),
          icon: this.getWeatherIcon(data.daily.weather_code[i])
        })) || []
      };
    } catch { return null; }
  },

  formatDate(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return '今天';
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return '明天';
    return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  },

  getWeatherCondition(code) {
    const map = { 0:'晴', 1:'晴', 2:'多云', 3:'阴', 45:'雾', 51:'小雨', 61:'雨', 71:'雪', 80:'阵雨', 95:'雷暴' };
    return map[code] || '未知';
  },

  getWeatherIcon(code) {
    if (code <= 1) return 'fa-sun';
    if (code === 2) return 'fa-cloud-sun';
    if (code === 3) return 'fa-cloud';
    if (code >= 45 && code <= 48) return 'fa-smog';
    if (code >= 51 && code <= 67) return 'fa-cloud-rain';
    if (code >= 71 && code <= 77) return 'fa-snowflake';
    if (code >= 80 && code <= 82) return 'fa-cloud-showers-heavy';
    if (code >= 95) return 'fa-bolt';
    return 'fa-cloud';
  },

  // 电影推荐 - 真实API，带3小时缓存
  async getMovieRecommendation() {
    // 检查缓存
    const cacheTime = await Storage.get('movieCacheTime') || 0;
    const cached = await Storage.get('movieCache');
    const now = Date.now();

    if (cached && (now - cacheTime) < RECOMMENDATION_CACHE_WINDOW) {
      return cached;
    }

    // 尝试从真实API获取中文电影
    const movie = await this.fetchChineseMovieFromAPI();
    
    if (!movie) {
      // 如果API失败，返回备用电影
      const fallbackMovies = [
        { title: '霸王别姬', originalTitle: '霸王别姬', year: '1993', rating: 9.6, genre: '剧情 / 爱情', director: '陈凯歌', poster: 'https://picsum.photos/seed/movie-bawang/300/450.jpg', quote: '风华绝代，人生如戏。' },
        { title: '活着', originalTitle: '活着', year: '1994', rating: 9.3, genre: '剧情 / 历史', director: '张艺谋', poster: 'https://picsum.photos/seed/movie-huozhe/300/450.jpg', quote: '人是为了活着本身而活着的。' },
        { title: '大话西游之大圣娶亲', originalTitle: '大话西游之大圣娶亲', year: '1995', rating: 9.2, genre: '喜剧 / 爱情', director: '刘镇伟', poster: 'https://picsum.photos/seed/movie-dahuaxiyou/300/450.jpg', quote: '曾经有一份真诚的爱情放在我面前。' }
      ];
      const fallbackMovie = fallbackMovies[Math.floor(Math.random() * fallbackMovies.length)];
      
      await Storage.set('movieCache', fallbackMovie);
      await Storage.set('movieCacheTime', now);
      return fallbackMovie;
    }

    // 保存到缓存
    await Storage.set('movieCache', movie);
    await Storage.set('movieCacheTime', now);

    return movie;
  },

  // 从真实API获取中文电影
  async fetchChineseMovieFromAPI() {
    const apis = [
      {
        url: 'https://api.sampleapis.com/movies',
        parse: (data) => {
          if (!Array.isArray(data) || data.length === 0) return null;
          const movie = data[Math.floor(Math.random() * Math.min(10, data.length))];
          return {
            title: movie.title || '电影标题',
            originalTitle: movie.title || '电影标题',
            year: movie.year ? String(movie.year) : '2024',
            rating: movie.imdbID ? 8.5 : (Math.random() * 2 + 7).toFixed(1),
            genre: movie.genres?.join(' / ') || '剧情',
            director: '导演',
            poster: movie.poster && movie.poster.startsWith('http') ? movie.poster : `https://picsum.photos/seed/movie-${Date.now()}/300/450.jpg`,
            quote: movie.description || '好电影总能治愈生活。',
            fullPlot: movie.description || '好电影总能治愈生活。'
          };
        }
      }
    ];

    for (const api of apis) {
      try {
        const res = await fetch(api.url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const data = await res.json();
        const parsed = api.parse(data);
        if (parsed) return parsed;
      } catch (e) {
        continue;
      }
    }

    return null;
  },

  // 汉语名言谚语
  chineseProverbs: [
    { text: '千里之行，始于足下。', author: '老子', source: '《道德经》', category: '励志' },
    { text: '学而不思则罔，思而不学则殆。', author: '孔子', source: '《论语》', category: '学习' },
    { text: '己所不欲，勿施于人。', author: '孔子', source: '《论语》', category: '修养' },
    { text: '天行健，君子以自强不息。', author: '《周易》', source: '《周易·乾卦》', category: '励志' },
    { text: '知之为知之，不知为不知，是知也。', author: '孔子', source: '《论语》', category: '学习' },
    { text: '三人行，必有我师焉。', author: '孔子', source: '《论语》', category: '学习' },
    { text: '欲穷千里目，更上一层楼。', author: '王之涣', source: '《登鹳雀楼》', category: '励志' },
    { text: '读书破万卷，下笔如有神。', author: '杜甫', source: '《奉赠韦左丞丈二十二韵》', category: '学习' },
    { text: '非淡泊无以明志，非宁静无以致远。', author: '诸葛亮', source: '《诫子书》', category: '修养' },
    { text: '不以物喜，不以己悲。', author: '范仲淹', source: '《岳阳楼记》', category: '修养' },
    { text: '业精于勤，荒于嬉；行成于思，毁于随。', author: '韩愈', source: '《进学解》', category: '学习' },
    { text: '书山有路勤为径，学海无涯苦作舟。', author: '韩愈', source: '古训', category: '学习' },
    { text: '少壮不努力，老大徒伤悲。', author: '《长歌行》', source: '汉乐府', category: '励志' },
    { text: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '古训', source: '古训', category: '励志' },
    { text: '海纳百川，有容乃大。', author: '林则徐', source: '对联', category: '修养' },
    { text: '路漫漫其修远兮，吾将上下而求索。', author: '屈原', source: '《离骚》', category: '励志' },
    { text: '不积跬步，无以至千里；不积小流，无以成江海。', author: '荀子', source: '《劝学》', category: '励志' },
    { text: '锲而舍之，朽木不折；锲而不舍，金石可镂。', author: '荀子', source: '《劝学》', category: '励志' },
    { text: '穷则独善其身，达则兼济天下。', author: '孟子', source: '《孟子》', category: '修养' },
    { text: '人无远虑，必有近忧。', author: '孔子', source: '《论语》', category: '智慧' },
    { text: '工欲善其事，必先利其器。', author: '孔子', source: '《论语》', category: '智慧' },
    { text: '温故而知新，可以为师矣。', author: '孔子', source: '《论语》', category: '学习' },
    { text: '博学之，审问之，慎思之，明辨之，笃行之。', author: '《中庸》', source: '《礼记·中庸》', category: '学习' },
    { text: '天下兴亡，匹夫有责。', author: '顾炎武', source: '《日知录》', category: '责任' },
    { text: '先天下之忧而忧，后天下之乐而乐。', author: '范仲淹', source: '《岳阳楼记》', category: '责任' },
    { text: '生于忧患，死于安乐。', author: '孟子', source: '《孟子》', category: '智慧' },
    { text: '君子坦荡荡，小人长戚戚。', author: '孔子', source: '《论语》', category: '修养' },
    { text: '知者不惑，仁者不忧，勇者不惧。', author: '孔子', source: '《论语》', category: '智慧' },
    { text: '有志者事竟成。', author: '《后汉书》', source: '《后汉书》', category: '励志' },
    { text: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游', source: '《冬夜读书示子聿》', category: '实践' },
    { text: '书到用时方恨少，事非经过不知难。', author: '陆游', source: '古训', category: '学习' },
    { text: '古之立大事者，不惟有超世之才，亦必有坚韧不拔之志。', author: '苏轼', source: '《晁错论》', category: '励志' },
    { text: '学无止境。', author: '荀子', source: '《劝学》', category: '学习' },
    { text: '不经一番寒彻骨，怎得梅花扑鼻香。', author: '黄檗禅师', source: '《上堂开示颂》', category: '励志' },
    { text: '长风破浪会有时，直挂云帆济沧海。', author: '李白', source: '《行路难》', category: '励志' },
    { text: '问渠那得清如许，为有源头活水来。', author: '朱熹', source: '《观书有感》', category: '学习' },
    { text: '横看成岭侧成峰，远近高低各不同。', author: '苏轼', source: '《题西林壁》', category: '智慧' },
    { text: '会当凌绝顶，一览众山小。', author: '杜甫', source: '《望岳》', category: '励志' },
    { text: '山重水复疑无路，柳暗花明又一村。', author: '陆游', source: '《游山西村》', category: '智慧' },
    { text: '沉舟侧畔千帆过，病树前头万木春。', author: '刘禹锡', source: '《酬乐天扬州初逢席上见赠》', category: '智慧' }
  ],

  async getDailyProverb(forceNew = false) {
    const todayKey = this.getDateKey();
    const cached = await Storage.get('proverbCache');
    const cacheDate = await Storage.get('proverbCacheDate');

    if (!forceNew && cached && cacheDate === todayKey) {
      return cached;
    }

    let proverb = await this.fetchDailyProverbFromAPI();
    if (!proverb) {
      proverb = this.getFallbackProverb(forceNew);
    }

    await Storage.set('proverbCache', proverb);
    await Storage.set('proverbCacheDate', todayKey);

    return proverb;
  },

  async fetchDailyProverbFromAPI() {
    const apis = [
      {
        url: 'https://v1.hitokoto.cn/?c=d&encode=json',
        parse: (data) => {
          if (!data?.hitokoto) return null;
          return {
            text: data.hitokoto.trim(),
            author: data.from_who || '',
            source: data.from || '',
            category: '每日分享'
          };
        }
      }
    ];

    for (const api of apis) {
      try {
        const res = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const data = await res.json();
        const parsed = api.parse(data);
        if (parsed?.text) return parsed;
      } catch (error) {
        continue;
      }
    }

    return null;
  },

  getFallbackProverb(forceNew = false) {
    if (!this.chineseProverbs.length) return null;
    if (forceNew) {
      return this.chineseProverbs[Math.floor(Math.random() * this.chineseProverbs.length)];
    }
    const todayKey = this.getDateKey();
    const hash = this.hashString(todayKey);
    return this.chineseProverbs[hash % this.chineseProverbs.length];
  },

  getDateKey(date = new Date()) {
    return date.toISOString().split('T')[0];
  },

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) & 0x7fffffff;
    }
    return hash;
  },


  // 网页游戏推荐
  getGamesRecommendation() {
    const games = [
      { name: '2048', url: 'https://play2048.co/', icon: '🎮', description: '经典数字合成游戏', color: '#edc22e' },
      { name: 'Wordle', url: 'https://www.nytimes.com/games/wordle/index.html', icon: '📝', description: '猜单词游戏', color: '#6aaa64' },
      { name: 'Tetris', url: 'https://tetris.com/play-tetris', icon: '🧩', description: '俄罗斯方块', color: '#0094d4' },
      { name: 'Pac-Man', url: 'https://www.google.com/logos/2010/pacman10-i.html', icon: '👾', description: '吃豆人经典', color: '#ffcc00' },
      { name: 'Snake', url: 'https://www.google.com/fbx?fbx=snake_arcade', icon: '🐍', description: '贪吃蛇', color: '#4caf50' },
      { name: 'Minesweeper', url: 'https://minesweeper.online/', icon: '💣', description: '扫雷', color: '#757575' }
    ];
    
    return games;
  },

  // 热榜
  async getHotTopics() {
    const results = { zhihu: [], weibo: [], toutiao: [] };
    const apis = [
      { url: 'https://api.vvhan.com/api/hotlist/zhihuHot', type: 'zhihu' },
      { url: 'https://api.vvhan.com/api/hotlist/wbHot', type: 'weibo' },
      { url: 'https://api.vvhan.com/api/hotlist/toutiaoHot', type: 'toutiao' }
    ];

    const LIMIT = 5;

    await Promise.all(apis.map(async api => {
      try {
        const res = await fetch(api.url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        if (data.success && data.data) {
          results[api.type] = data.data.slice(0, LIMIT).map((item, i) => ({
            title: item.title,
            url: item.url,
            hot: item.hot || '',
            index: i + 1
          }));
        }
      } catch {
        results[api.type] = this.getBackupHot(api.type);
      }
    }));

    Object.keys(results).forEach(k => {
      if (!results[k].length) results[k] = this.getBackupHot(k);
    });

    return results;
  },

  getBackupHot(type) {
    const zhihu = [
      { title: 'OpenAI 最新模型带来哪些影响？', url: 'https://www.zhihu.com', hot: '热', index: 1 },
      { title: '如何高效打造 AI 助手工作流？', url: 'https://www.zhihu.com', hot: '沸', index: 2 },
      { title: '年轻人如何平衡副业与生活？', url: 'https://www.zhihu.com', hot: '热', index: 3 },
      { title: '2024 年最值得入手的数码设备', url: 'https://www.zhihu.com', hot: '荐', index: 4 },
      { title: '在一线城市怎样实现存钱自由？', url: 'https://www.zhihu.com', hot: '热', index: 5 }
    ];

    const weibo = [
      { title: '世界杯预选赛今晚打响', url: 'https://s.weibo.com/top/summary', hot: '沸', index: 1 },
      { title: '新剧开播口碑逆袭', url: 'https://s.weibo.com/top/summary', hot: '热', index: 2 },
      { title: '航天员出差记 Vlog 更新', url: 'https://s.weibo.com/top/summary', hot: '荐', index: 3 },
      { title: '又一城市宣布发放消费券', url: 'https://s.weibo.com/top/summary', hot: '新', index: 4 },
      { title: '这届年轻人开始随手拍云', url: 'https://s.weibo.com/top/summary', hot: '热', index: 5 }
    ];

    const toutiao = [
      { title: '国内首条无人驾驶公交线路开通', url: 'https://www.toutiao.com', hot: '热', index: 1 },
      { title: '多地 GDP 半年报公布', url: 'https://www.toutiao.com', hot: '荐', index: 2 },
      { title: '中国科研团队再获突破', url: 'https://www.toutiao.com', hot: '热', index: 3 },
      { title: '数字人民币试点场景扩容', url: 'https://www.toutiao.com', hot: '新', index: 4 },
      { title: '暑期档电影预售成绩抢眼', url: 'https://www.toutiao.com', hot: '热', index: 5 }
    ];

    const data = { zhihu, weibo, toutiao };
    return data[type] || [];
  },

  async getRandomWallpaper(source = 'unsplash', category = 'nature') {
    const api = this.imageAPIs[source];
    if (!api) return null;
    try {
      return typeof api.getUrl === 'function' ? await api.getUrl(category) : api.getUrl;
    } catch { return `https://picsum.photos/1920/1080?t=${Date.now()}`; }
  }
};
