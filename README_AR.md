# Life Tracker — نسخة Next.js / Vercel

هاد المشروع هو النسخة Online الجاهزة للبناء والنشر.

فيه:
- Next.js + TypeScript
- Supabase Auth + Database
- PWA
- Web Push Notifications
- Vercel Cron كل دقيقة للتذكيرات
- البرنامج الأسبوعي من الجمعة للخميس
- الرياضة: السبت / الاثنين / الأربعاء
- تأكيد المهام اليومية
- Notes
- Dark / Light
- Mobile-first

## قبل النشر

1. صايب Project في Supabase.
2. شغّل `supabase/schema.sql`.
3. فعّل Magic Link / Email OTP.
4. ولد مفاتيح Web Push:
   `npx web-push generate-vapid-keys`
5. حط المتغيرات الموجودة في `.env.example` داخل Vercel.
6. Push المشروع إلى GitHub ومن بعد Import في Vercel.
7. من بعد Deploy، دخل للتطبيق، سجل بالإيميل، واضغط NOTIFY.

### ملاحظة مهمة

أوقات الصلاة الموجودة في Seed هي placeholders قابلة للتعديل، ماشي مواقيت شرعية دقيقة. خاصنا نربطها لاحقاً بمصدر مواقيت الصلاة حسب المدينة وطريقة الحساب اللي بغيتي.

### Notifications

Vercel Cron كيشغل endpoint ديال reminders كل دقيقة، وكيشوف واش كاين task دابا وكيبعث Web Push للأجهزة المسجلة. إذا كانت المهمة متعلّمة Done، ما كيبعثش notification.

على iPhone، الأفضل تثبت الـPWA من Share → Add to Home Screen وتسمح بالإشعارات.


## تحسينات الهاتف
- تخطيط متجاوب للهاتف والتابلت والحاسوب.
- أزرار المهام مناسبة للمس، ونموذج إضافة/تعديل المهمة يظهر من أسفل الشاشة على الهواتف.
- شبكة الأيام والبطاقات والملاحظات تتكيف مع عرض الشاشة لتقليل التمرير الأفقي.
