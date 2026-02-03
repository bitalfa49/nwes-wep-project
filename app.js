'use strict';

const firebaseConfig = {
  apiKey: "AIzaSyALF_LdFqvDpEXsRhDP61L2-Zj46H_WqXc",
  authDomain: "radar24lb-972bb.firebaseapp.com",
  databaseURL: "https://radar24lb-972bb-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "radar24lb-972bb",
  storageBucket: "radar24lb-972bb.firebasestorage.app",
  messagingSenderId: "153054266818",
  appId: "1:153054266818:web:8f8b8f93f5b39350fbc25b",
  measurementId: "G-QXHHDBB6D6"
};

const AppConfig = {
    firebase: firebaseConfig,
    ui: {
        newsContainerId: 'newsContainer',
        searchModalId: 'searchModal',
        maxTickerItems: 5
    },
    defaults: {
        image: '', // Empty default - will be handled by CSS
        avatar: 'https://via.placeholder.com/100x100?text=User'
    },
    storageKeys: {
        cachedNews: 'cachedNews',
        userPrefs: 'userPreferences'
    }
};

const Utils = {
    timeAgo: (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString; 

        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        const intervals = {
            'سنة': 31536000,
            'شهر': 2592000,
            'أسبوع': 604800,
            'يوم': 86400,
            'ساعة': 3600,
            'دقيقة': 60,
            'ثانية': 1
        };

        for (let [key, value] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / value);
            if (interval >= 1) {
                return `منذ ${interval} ${key}`;
            }
        }
        return 'الآن';
    },

    /**
     * تنظيف النصوص من الأكواد الخبيثة (XSS Protection)
     * @param {string} str 
     * @returns {string} Sanitized string
     */
    sanitize: (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * توليد معرفات عشوائية للعناصر
     */
    generateID: () => '_' + Math.random().toString(36).substr(2, 9),

    /**
     * التحقق من رابط الصورة - Enhanced validation
     */
    isValidImage: (url) => {
        if (!url || url.trim() === '' || url === '#' || url === 'null' || url === 'undefined') {
            return false;
        }
        return url.length > 10 && (url.startsWith('http') || url.startsWith('data:image'));
    }
};

const StorageManager = {
    set: (key, value) => {
        try {
            const serialized = JSON.stringify(value);
            localStorage.setItem(key, serialized);
        } catch (e) {
            console.warn('[System] Storage Write Error:', e);
        }
    },
    get: (key) => {
        try {
            const serialized = localStorage.getItem(key);
            return serialized ? JSON.parse(serialized) : null;
        } catch (e) {
            console.warn('[System] Storage Read Error:', e);
            return null;
        }
    },
    remove: (key) => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn('[System] Storage Remove Error:', e);
        }
    }
};

class Store {
    constructor() {
        this.state = {
            news: [],
            filteredNews: [],
            supporters: [],
            activeCategory: 'الكل',
            isLoading: true,
            searchQuery: '',
            isSidebarOpen: false
        };
        this.listeners = [];
    }

    /**
     * الحصول على نسخة من الحالة الحالية
     */
    getState() {
        return { ...this.state };
    }

    /**
     * تحديث الحالة وتبليغ المشتركين
     * @param {object} newState - Partial state update
     */
    setState(newState) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...newState };
        
        this.notify(prevState);
    }

    /**
     * الاشتراك في التحديثات
     * @param {function} listener 
     */
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify(prevState) {
        this.listeners.forEach(listener => listener(this.state, prevState));
    }
}

// تهيئة المتجر العام
const appStore = new Store();

class FirebaseService {
    constructor() {
        this.db = null;
        this.isConnected = false;
        this.init();
    }

    init() {
        // التحقق من وجود المكتبة
        if (typeof firebase === 'undefined') {
            console.error('[Critical] Firebase SDK not loaded.');
            alert('حدث خطأ في تحميل ملفات النظام. يرجى تحديث الصفحة.');
            return;
        }

        // نمط Singleton لمنع التهيئة المزدوجة
        if (!firebase.apps.length) {
            try {
                firebase.initializeApp(AppConfig.firebase);
                this.isConnected = true;
                console.log('[System] Firebase Initialized Successfully.');
            } catch (e) {
                console.error('[System] Firebase Init Failed:', e);
                this.handleConnectionError();
            }
        } else {
            this.isConnected = true;
        }

        this.db = firebase.database();
    }

    /**
     * الاستماع لتحديثات الأخبار في الوقت الفعلي
     */
    subscribeToNews() {
        if (!this.isConnected) return;

        const newsRef = this.db.ref('allNews');
        
        // استخدام 'on' للاستماع المستمر
        newsRef.on('value', (snapshot) => {
            const data = snapshot.val();
            let parsedNews = [];

            if (data) {
                // تحويل الكائن إلى مصفوفة وإضافة المعرف (ID)
                parsedNews = Object.entries(data).map(([key, value]) => ({
                    id: key,
                    ...value
                })).reverse(); // الأحدث أولاً
            }

            // تحديث المتجر
            appStore.setState({ 
                news: parsedNews,
                filteredNews: this.applyFilters(parsedNews, appStore.getState().activeCategory),
                isLoading: false
            });

            // تحديث الكاش (Cache Strategy)
            StorageManager.set(AppConfig.storageKeys.cachedNews, parsedNews.slice(0, 20));

        }, (error) => {
            console.error('[Data] News Fetch Error:', error);
            // محاولة استرجاع البيانات من الكاش عند الفشل
            const cached = StorageManager.get(AppConfig.storageKeys.cachedNews);
            if(cached) {
                console.info('[Data] Loaded from Cache');
                appStore.setState({ news: cached, filteredNews: cached, isLoading: false });
            }
        });
    }

    /**
     * الاستماع لتحديثات الداعمين
     */
    subscribeToSupporters() {
        if (!this.isConnected) return;

        const supportersRef = this.db.ref('supporters');

        supportersRef.on('value', (snapshot) => {
            const data = snapshot.val();
            let parsedSupporters = [];

            if (data) {
                // ترتيب الداعمين حسب المبلغ
                parsedSupporters = Object.values(data).sort((a, b) => b.amount - a.amount);
            }

            appStore.setState({ supporters: parsedSupporters });
        });
    }

    /**
     * تطبيق فلاتر البحث والتصنيف
     */
    applyFilters(newsArray, category) {
        let filtered = [...newsArray];

        // فلتر التصنيف
        if (category && category !== 'الكل') {
            filtered = filtered.filter(n => n.category === category);
        }

        // فلتر البحث (إذا كان هناك استعلام بحث)
        const query = appStore.getState().searchQuery;
        if (query && query.length > 0) {
            const lowerQuery = query.toLowerCase();
            filtered = filtered.filter(n => 
                n.title.toLowerCase().includes(lowerQuery) || 
                n.text.toLowerCase().includes(lowerQuery)
            );
        }

        return filtered;
    }

    handleConnectionError() {
        console.error('[System] Failed to connect to Firebase.');
        // يمكنك هنا إضافة Fallback أو إعادة محاولة الاتصال
    }
}

// تهيئة خدمة Firebase
const firebaseService = new FirebaseService();

/* ==========================================================================
   6. CONTROLLERS
   المتحكمات (وسطاء بين البيانات والواجهة)
   ========================================================================== */
const NewsController = {
    init: () => {
        firebaseService.subscribeToNews();
    },

    /**
     * تغيير التصنيف النشط
     * @param {string} category 
     */
    filterByCategory: (category) => {
        const state = appStore.getState();
        const filtered = firebaseService.applyFilters(state.news, category);
        appStore.setState({ 
            activeCategory: category,
            filteredNews: filtered 
        });
    },

    /**
     * البحث في الأخبار
     * @param {string} query 
     */
    search: (query) => {
        appStore.setState({ searchQuery: query });
        const state = appStore.getState();
        const filtered = firebaseService.applyFilters(state.news, state.activeCategory);
        appStore.setState({ filteredNews: filtered });
    }
};

const SupportersController = {
    init: () => {
        firebaseService.subscribeToSupporters();
    }
};

// تعريض الدالة عالمياً للاستخدام في HTML
window.filterNews = NewsController.filterByCategory;

/* ==========================================================================
   7. UI RENDERING ENGINE
   محرك عرض الواجهة (رسم العناصر ديناميكياً)
   ========================================================================== */
const UI = {
    selectors: {
        newsGrid: document.getElementById('newsContainer'),
        tickerContent: document.getElementById('tickerContent'),
        sectionTitle: document.getElementById('sectionTitle'),
        supportersGrid: document.getElementById('supportersGrid'),
        modal: document.getElementById('newsModal'),
        modalBody: document.getElementById('modalBody'),
        sidebar: document.getElementById('mobileSidebar')
    },

    /**
     * رسم شبكة الأخبار
     * @param {Array} newsArray 
     */
    renderNews: (newsArray) => {
        const container = UI.selectors.newsGrid;
        
        if (!newsArray || newsArray.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#888; width:100%; padding:40px;">لا توجد أخبار لعرضها حالياً</p>';
            return;
        }

        const html = newsArray.map(news => {
            const hasValidImage = Utils.isValidImage(news.image);
            const cardClass = hasValidImage ? '' : 'no-image';
            
            // Only include image HTML if image is valid
            const imageHTML = hasValidImage ? `
                <div class="card-img-wrap">
                    <img src="${news.image}" alt="${Utils.sanitize(news.title)}" onerror="this.parentElement.style.display='none'; this.closest('.news-card').classList.add('no-image');">
                    <span class="category-badge">${news.category}</span>
                </div>
            ` : `
                <div class="card-img-wrap" style="display: none;"></div>
            `;

            return `
                <div class="news-card ${cardClass}" onclick="openNewsModal('${news.id}')">
                    ${imageHTML}
                    <div class="card-body">
                        <div class="card-meta">
                            <span><i class="far fa-clock"></i> ${Utils.timeAgo(news.time)}</span>
                            ${!hasValidImage ? `<span class="category-badge" style="position: static; margin-left: auto;">${news.category}</span>` : ''}
                        </div>
                        <h3 class="card-title">${Utils.sanitize(news.title)}</h3>
                        <p class="card-excerpt">${Utils.sanitize(news.text)}</p>
                        <div class="card-footer">
                            <span class="read-more">
                                اقرأ المزيد
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M5 12h14M12 5l7 7-7 7"/>
                                </svg>
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    },

    /**
     * رسم الشريط العاجل (News Ticker)
     * @param {Array} newsArray 
     */
    renderTicker: (newsArray) => {
        const container = UI.selectors.tickerContent;
        if (!newsArray || newsArray.length === 0) return;

        // أخذ أول 5 أخبار عاجلة
        const urgentNews = newsArray
            .filter(n => n.category === 'عاجل')
            .slice(0, AppConfig.ui.maxTickerItems);

        if (urgentNews.length === 0) {
            // إذا لم توجد أخبار عاجلة، نعرض آخر الأخبار
            urgentNews.push(...newsArray.slice(0, 3));
        }

        const items = urgentNews
            .map(n => `<span style="display:inline-block; margin-left:50px;"><span style="color:var(--accent-red)">●</span> ${Utils.sanitize(n.title)}</span>`)
            .join('');

        // تكرار المحتوى لضمان استمرارية الحركة
        container.innerHTML = items + items; 
    },

    /**
     * رسم قسم الداعمين (3D Cards)
     * @param {Array} supporters 
     */
    renderSupporters: (supporters) => {
        const container = UI.selectors.supportersGrid;
        
        if (!supporters || supporters.length === 0) {
            container.innerHTML = '<p style="color:white; width:100%;">كن أول الداعمين!</p>';
            return;
        }

        const html = supporters.map((sup, index) => {
            const isGold = index === 0;
            const tierClass = isGold ? 'gold-tier' : '';
            const amountTxt = sup.privacy === 'hide' ? '*****' : `$${sup.amount}`;
            const imageSrc = sup.image || AppConfig.defaults.avatar;
            
            // أيقونة التاج للمركز الأول
            const crownHtml = isGold ? `
                <div style="position:absolute; top:-25px; left:50%; transform:translateX(-50%); z-index:10; filter:drop-shadow(0 5px 10px rgba(0,0,0,0.5));">
                    <svg width="50" height="50" viewBox="0 0 24 24" fill="#FFD700"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>
                </div>
            ` : '';

            return `
                <div class="vip-card ${tierClass}" style="animation-delay: ${index * 0.2}s">
                    ${crownHtml}
                    <div class="vip-avatar-box">
                        <img src="${imageSrc}" alt="${sup.name}" onerror="this.onerror=null; this.src='${AppConfig.defaults.avatar}'">
                    </div>
                    <h4>${Utils.sanitize(sup.name)}</h4>
                    <div class="supporter-amount">${amountTxt}</div>
                    ${isGold ? '<div class="card-glow"></div>' : ''}
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    },

    /**
     * تحديث عنوان القسم النشط
     */
    updateTitle: (category) => {
        const titles = {
            'الكل': 'حيثما كان الحدث.. كان الرادار أول الحاضرين',
            'عاجل': ' التغطية المباشرة والأخبار العاجلة',
            'أخبار العالم': ' رصد الأحداث الدولية',
            'سياسة': ' المشهد السياسي',
            'رياضة': ' الملاعب والنتائج',
            'اقتصاد': ' المال والأعمال'
        };
        const title = titles[category] || category;
        
        // تأثير الكتابة (Typewriter effect simulation)
        const el = UI.selectors.sectionTitle;
        el.style.opacity = '0';
        setTimeout(() => {
            el.innerText = title;
            el.style.opacity = '1';
        }, 200);
    },

    /**
     * تحديث حالة الأزرار النشطة (Active State)
     */
    updateActiveButtons: (category) => {
        // تحديث القائمة العلوية
        document.querySelectorAll('.nav-link').forEach(btn => {
            btn.classList.remove('active');
            if(btn.innerText.includes(category) || (category === 'الكل' && btn.innerText.includes('الرئيسية'))) {
                btn.classList.add('active');
            }
        });

        // تحديث أزرار الفلترة السفلية
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.innerText === category ? btn.classList.add('active') : btn.classList.remove('active');
        });
    }
};

/* ==========================================================================
   8. INTERACTION MANAGER
   مدير التفاعل (النوافذ، الأزرار، البحث)
   ========================================================================== */
const InteractionManager = {
    /**
     * فتح نافذة تفاصيل الخبر
     * @param {string} newsId 
     */
    openNews: (newsId) => {
        const state = appStore.getState();
        // البحث في جميع الأخبار (وليس المفلترة فقط) لضمان العثور عليه
        const newsItem = state.news.find(n => n.id === newsId);
        
        if (!newsItem) return;

        const modal = UI.selectors.modal;
        const body = UI.selectors.modalBody;
        const hasValidImage = Utils.isValidImage(newsItem.image);
        
        const imageSrc = hasValidImage ? newsItem.image : '';
        const imageHTML = hasValidImage ? `
            <img src="${imageSrc}" alt="${newsItem.title}" onerror="this.style.display='none'">
        ` : '';

        // حقن المحتوى
        body.innerHTML = `
            ${imageHTML}
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                <span style="background:var(--accent-red); color:white; padding:4px 12px; border-radius:4px; font-size:0.8rem;">${newsItem.category}</span>
                <span style="color:#888; font-size:0.9rem;"><i class="far fa-clock"></i> ${Utils.timeAgo(newsItem.time)}</span>
            </div>
            <h2>${newsItem.title}</h2>
            <div style="width:50px; height:3px; background:var(--accent-red); margin:20px 0;"></div>
            <p>${newsItem.text.replace(/\n/g, '<br>')}</p>
        `;

        // إظهار النافذة
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // منع التمرير في الخلفية
    },

    closeModal: () => {
        const modal = UI.selectors.modal;
        modal.style.display = 'none';
        document.body.style.overflow = 'auto'; // إعادة التمرير
    },

    toggleSidebar: () => {
        UI.selectors.sidebar.classList.toggle('active');
    },

    handleSearch: (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value;
            if (query.trim().length > 0) {
                NewsController.search(query);
                // إغلاق نافذة البحث
                document.getElementById('searchModal').style.display = 'none';
            }
        }
    }
};

/* ==========================================================================
   9. BOOTSTRAP & EVENT BINDING
   الإقلاع وربط الأحداث
   ========================================================================== */

// الاشتراك في تحديثات المتجر (Reactive View Update)
appStore.subscribe((state, prevState) => {
    
    // إذا تغيرت الأخبار المفلترة أو التصنيف، نحدث الشبكة
    if (state.filteredNews !== prevState.filteredNews) {
        UI.renderNews(state.filteredNews);
    }

    // إذا تغيرت قائمة الأخبار الأصلية (جلب جديد)، نحدث الشريط العاجل
    if (state.news !== prevState.news) {
        UI.renderTicker(state.news);
    }

    // إذا تغير التصنيف النشط، نحدث العناوين والأزرار
    if (state.activeCategory !== prevState.activeCategory) {
        UI.updateTitle(state.activeCategory);
        UI.updateActiveButtons(state.activeCategory);
    }

    // تحديث الداعمين
    if (state.supporters !== prevState.supporters) {
        UI.renderSupporters(state.supporters);
    }
});

// عند جاهزية المستند (DOM Ready)
document.addEventListener("DOMContentLoaded", function() {
    // البدء بتحميل البيانات
    NewsController.init();
    SupportersController.init();
});

/* ==========================================================================
   10. SECRET ADMIN ACCESS
   كود الدخول السري للإدارة (6 ضغطات)
   ========================================================================== */
let logoClickCount = 0;
let clickTimer;

function handleLogoClick() {
    logoClickCount++;
    
    // إعادة تصفير العداد إذا توقف عن الضغط لمدة 5 ثواني
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
        logoClickCount = 0;
    }, 5000);

    // إذا وصل لـ 6 ضغطات
    if (logoClickCount === 6) {
        const password = prompt("🔐 أدخل كود الوصول للوحة القيادة:");
        if (password === "hassan@123456789") {
            window.location.href = "admin.html";
        } else {
            alert("❌ الكود خاطئ!");
        }
        logoClickCount = 0; // تصفير العداد
    }
}

// Global function to open news modal
window.openNewsModal = InteractionManager.openNews;

// دالة لتعبئة البحث عند الضغط على الترند
function fillSearch(keyword) {
    const inputField = document.getElementById('searchInput');
    inputField.value = keyword; // وضع الكلمة في الحقل
    inputField.focus(); // وضع المؤشر للكتابة
}

// دالة تفتح/تغلق نافذة البحث - Enhanced with modern close
function toggleSearch() {
    const modal = document.getElementById('searchModal');
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'flex';
        document.getElementById('searchInput').focus();
    }
}

// دالة لإغلاق القائمة الجانبية
function toggleSidebar() {
    const sidebar = document.getElementById('mobileSidebar');
    sidebar.classList.toggle('active');
}
