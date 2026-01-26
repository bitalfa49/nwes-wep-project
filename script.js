// تفعيل القائمة المتنقلة
document.addEventListener('DOMContentLoaded', function() {
    const menuBtn = document.querySelector('.menu-btn');
    const navLinks = document.querySelector('.nav-links');
    
    menuBtn.addEventListener('click', function() {
        navLinks.classList.toggle('active');
    });
    
    // إغلاق القائمة عند النقر خارجها
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.navbar')) {
            navLinks.classList.remove('active');
        }
    });
    
    // تأثير التمرير السلس
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
                navLinks.classList.remove('active');
            }
        });
    });
    
    // تأثيرات عند التمرير
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 100) {
            navbar.style.background = 'rgba(106, 17, 203, 0.95)';
        } else {
            navbar.style.background = 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)';
        }
    });
    
    // تحميل الديناميكي
    console.log('الموقع جاهز للعمل!');
});